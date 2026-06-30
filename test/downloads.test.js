import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createTestHandlers,
  fspExists,
  getRealSource,
  invokeHttp,
  invokeMcp,
  keyword,
  tempRoot,
  withRealSourceEnv
} from './support/helpers.js';

const realSource = getRealSource(file => file.includes('最新'));

test('download task management works over HTTP and MCP', { skip: !realSource.path, timeout: 90000 }, async () => {
  await withRealSourceEnv(async () => {
    const { httpHandler, mcpHandler } = await createTestHandlers();
    const firstSong = await searchFirstSong(httpHandler);
    const updatedConfig = await invokeHttp(httpHandler, 'PATCH', '/config', {
      download: { quality: '128k', qualityStrategy: 'lowest', sourceStrategy: 'all' }
    });
    assert.equal(updatedConfig.statusCode, 200);
    assert.equal(updatedConfig.body.data.download.quality, '128k');

    const downloadTask = await invokeHttp(httpHandler, 'POST', '/downloads', {
      autoStart: false,
      songInfo: firstSong,
      options: { embedCover: false, embedLyric: false, saveLyricFile: false }
    });
    assert.equal(downloadTask.statusCode, 200);
    assert.equal(downloadTask.body.ok, true);
    assert.equal(downloadTask.body.data.status, 'waiting');
    assert.equal(downloadTask.body.data.musicInfo.name, firstSong.name);
    assert.equal(downloadTask.body.data.quality, '128k');
    assert.equal(downloadTask.body.data.qualityStrategy, 'lowest');
    assert.equal(downloadTask.body.data.sourceStrategy, 'all');

    const taskId = downloadTask.body.data.id;
    const taskDetail = await invokeHttp(httpHandler, 'GET', `/downloads/${taskId}`);
    assert.equal(taskDetail.statusCode, 200);
    assert.equal(taskDetail.body.data.id, taskId);

    const taskList = await invokeHttp(httpHandler, 'GET', '/downloads');
    assert.ok(taskList.body.data.some(task => task.id === taskId));

    const mcpTaskDetail = await invokeMcp(mcpHandler, {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: { name: 'get_download_task', arguments: { id: taskId } }
    });
    assert.equal(mcpTaskDetail.result.structuredContent.id, taskId);

    const pauseTask = await invokeHttp(httpHandler, 'POST', `/downloads/${taskId}/pause`);
    assert.equal(pauseTask.statusCode, 200);
    assert.equal(pauseTask.body.data.status, 'paused');

    const cancelTask = await invokeHttp(httpHandler, 'POST', `/downloads/${taskId}/cancel`);
    assert.equal(cancelTask.statusCode, 200);
    assert.equal(cancelTask.body.data.status, 'canceled');

    const deletableTask = await invokeHttp(httpHandler, 'POST', '/downloads', {
      autoStart: false,
      songInfo: firstSong,
      options: { embedCover: false, embedLyric: false, saveLyricFile: false }
    });
    const deleteTask = await invokeHttp(httpHandler, 'DELETE', `/downloads/${deletableTask.body.data.id}`);
    assert.equal(deleteTask.statusCode, 200);
    assert.equal(deleteTask.body.data.status, 'canceled');
    assert.equal(deleteTask.body.data.deleted, true);
    const afterDelete = await invokeHttp(httpHandler, 'GET', `/downloads/${deletableTask.body.data.id}`);
    assert.equal(afterDelete.statusCode, 404);

    const mcpDownloadTask = await invokeMcp(mcpHandler, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'create_download_task',
        arguments: {
          autoStart: false,
          songInfo: firstSong,
          options: { embedCover: false, embedLyric: false, saveLyricFile: false }
        }
      }
    });
    assert.equal(mcpDownloadTask.result.structuredContent.status, 'waiting');
    assert.equal(mcpDownloadTask.result.structuredContent.qualityStrategy, 'lowest');
  }, { files: [realSource.fileName], root: `${tempRoot}-download-tasks` });
});

test('local file download resumes and writes lyric and metadata artifacts', { skip: !realSource.path, timeout: 90000 }, async () => {
  await withRealSourceEnv(async root => {
    const { httpHandler } = await createTestHandlers();
    const firstSong = await searchFirstSong(httpHandler);
    const sourceBytes = Buffer.from('music-hub local download fixture\n'.repeat(128));
    const sourceAudioPath = path.join(root, 'cache', 'source-audio.bin');
    await fs.mkdir(path.dirname(sourceAudioPath), { recursive: true });
    await fs.writeFile(sourceAudioPath, sourceBytes);

    const localDownload = await invokeHttp(httpHandler, 'POST', '/downloads', {
      autoStart: false,
      url: pathToFileURL(sourceAudioPath).href,
      fileName: 'local-download.mp3',
      songInfo: firstSong,
      quality: '128k',
      options: { embedCover: false, embedLyric: false, saveLyricFile: true }
    });
    assert.equal(localDownload.statusCode, 200);
    await fs.writeFile(localDownload.body.data.filePath, sourceBytes.subarray(0, 37));

    const resumedDownload = await invokeHttp(httpHandler, 'POST', `/downloads/${localDownload.body.data.id}/resume`);
    assert.equal(resumedDownload.statusCode, 200);
    assert.equal(resumedDownload.body.data.status, 'completed');
    assert.deepEqual(await fs.readFile(localDownload.body.data.filePath), sourceBytes);
    assert.equal(await fspExists(`${localDownload.body.data.filePath}.music-hub-meta.json`), false);

    const downloadFiles = await fs.readdir(path.join(root, 'downloads'));
    assert.ok(downloadFiles.some(file => file.endsWith('.lrc')));
  }, { files: [realSource.fileName], root: `${tempRoot}-download-resume` });
});

test('HTTP download retries, resumes with Range, honors download dir, and supports source platform quality combinations', { timeout: 30000 }, async () => {
  const sourceBytes = Buffer.from('music-hub http download fixture\n'.repeat(256));
  const requests = [];
  let failuresBeforeSuccess = 2;
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, range: req.headers.range || '' });
    if (req.url.startsWith('/unstable') && failuresBeforeSuccess > 0) {
      failuresBeforeSuccess -= 1;
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('retry later');
      return;
    }
    const range = req.headers.range || '';
    const start = Number(range.match(/bytes=(\d+)-/)?.[1] || 0);
    const body = sourceBytes.subarray(start);
    res.writeHead(start ? 206 : 200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': body.length,
      ...(start ? { 'Content-Range': `bytes ${start}-${sourceBytes.length - 1}/${sourceBytes.length}` } : {}),
      'Accept-Ranges': 'bytes'
    });
    res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await withRealSourceEnv(async root => {
      await fs.writeFile(path.join(root, 'sources', 'download-combo-source.js'), downloadComboSource(port));
      const { httpHandler } = await createTestHandlers();

      const config = await invokeHttp(httpHandler, 'GET', '/config');
      assert.equal(config.body.data.download.retryCount, 3);
      assert.equal(config.body.data.download.retryIntervalMs, 5);

      const songInfo = {
        source: 'kw',
        name: '紅蓮華',
        singer: 'LiSA',
        interval: '03:56',
        types: [{ type: '128k' }, { type: '320k' }]
      };

      const created = await invokeHttp(httpHandler, 'POST', '/downloads', {
        autoStart: false,
        songInfo,
        platform: 'tx',
        provider: 'download-combo-source',
        quality: '128k',
        retryCount: 3,
        retryIntervalMs: 5,
        fileName: 'combo-download.mp3',
        options: { embedCover: false, saveCoverFile: false, embedLyric: false, saveLyricFile: false }
      });
      assert.equal(created.statusCode, 200);
      assert.equal(created.body.data.platform, 'tx');
      assert.equal(created.body.data.provider, 'download-combo-source');
      assert.equal(created.body.data.quality, '128k');
      assert.equal(created.body.data.maxRetries, 3);
      assert.equal(created.body.data.retryIntervalMs, 5);
      assert.equal(path.dirname(created.body.data.filePath), path.join(root, 'downloads'));

      await fs.writeFile(created.body.data.filePath, sourceBytes.subarray(0, 101));
      const resumed = await invokeHttp(httpHandler, 'POST', `/downloads/${created.body.data.id}/resume`);
      assert.equal(resumed.statusCode, 200);
      assert.equal(resumed.body.data.status, 'completed');
      assert.equal(resumed.body.data.musicInfo.source, 'tx');
      assert.equal(resumed.body.data.quality, '128k');
      assert.equal(resumed.body.data.attempts, 3);
      assert.match(resumed.body.data.url, /platform=tx&quality=128k/);
      assert.deepEqual(await fs.readFile(resumed.body.data.filePath), sourceBytes);
      assert.ok(requests.some(item => item.url.startsWith('/unstable') && item.range === 'bytes=101-'));

      const sourceOnly = await invokeHttp(httpHandler, 'POST', '/downloads', {
        autoStart: false,
        songInfo,
        source: 'kg',
        provider: 'download-combo-source',
        qualityStrategy: 'highest',
        fileName: 'source-only.flac',
        options: { embedCover: false, saveCoverFile: false, embedLyric: false, saveLyricFile: false }
      });
      assert.equal(sourceOnly.body.data.platform, 'kg');
      const sourceOnlyDone = await invokeHttp(httpHandler, 'POST', `/downloads/${sourceOnly.body.data.id}/resume`);
      assert.equal(sourceOnlyDone.body.data.status, 'completed');
      assert.equal(sourceOnlyDone.body.data.musicInfo.source, 'kg');
      assert.equal(sourceOnlyDone.body.data.quality, '320k');
      assert.match(sourceOnlyDone.body.data.url, /platform=kg&quality=320k/);

      const defaultTask = await invokeHttp(httpHandler, 'POST', '/downloads', {
        autoStart: false,
        songInfo,
        provider: 'download-combo-source',
        fileName: 'default-combo.mp3',
        options: { embedCover: false, saveCoverFile: false, embedLyric: false, saveLyricFile: false }
      });
      const defaultDone = await invokeHttp(httpHandler, 'POST', `/downloads/${defaultTask.body.data.id}/resume`);
      assert.equal(defaultDone.body.data.status, 'completed');
      assert.equal(defaultDone.body.data.musicInfo.source, 'kw');
      assert.equal(defaultDone.body.data.quality, '320k');
      assert.match(defaultDone.body.data.url, /platform=kw&quality=320k/);
    }, {
      files: [],
      root: `${tempRoot}-http-download`,
      env: {
        MUSIC_HUB_DOWNLOAD_QUALITY: '320k',
        MUSIC_HUB_DOWNLOAD_QUALITY_STRATEGY: 'specified',
        MUSIC_HUB_DOWNLOAD_SOURCE_STRATEGY: 'specified',
        MUSIC_HUB_DOWNLOAD_RETRY_COUNT: '3',
        MUSIC_HUB_DOWNLOAD_RETRY_INTERVAL_MS: '5'
      }
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('download task embeds downloaded lyric and cover into MP3 metadata', { timeout: 30000 }, async () => {
  const audioBytes = Buffer.from([0xff, 0xfb, 0x90, 0x64, ...Buffer.from('music-hub embed audio')]);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/song.mp3')) {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audioBytes.length });
      res.end(audioBytes);
      return;
    }
    if (req.url.startsWith('/cover.png')) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png1x1.length });
      res.end(png1x1);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await withRealSourceEnv(async root => {
      await fs.writeFile(path.join(root, 'sources', 'download-embed-source.js'), downloadEmbedSource(port));
      const { httpHandler } = await createTestHandlers();
      const songInfo = {
        source: 'kw',
        name: '紅蓮華',
        singer: 'LiSA',
        albumName: 'LEO-NiNE',
        types: [{ type: '128k' }]
      };

      const created = await invokeHttp(httpHandler, 'POST', '/downloads', {
        autoStart: false,
        songInfo,
        provider: 'download-embed-source',
        quality: '128k',
        fileName: 'embed-task.mp3',
        options: { embedCover: true, saveCoverFile: true, embedLyric: true, saveLyricFile: true }
      });
      assert.equal(created.statusCode, 200);

      const completed = await invokeHttp(httpHandler, 'POST', `/downloads/${created.body.data.id}/resume`);
      assert.equal(completed.statusCode, 200);
      assert.equal(completed.body.data.status, 'completed');
      assert.equal(completed.body.data.artifacts.metadata.embedded, true);
      assert.equal(completed.body.data.artifacts.metadata.format, 'mp3');
      assert.equal(completed.body.data.artifacts.metadata.lyricEmbedded, true);
      assert.ok(await fspExists(completed.body.data.artifacts.cover));
      assert.equal(await fspExists(`${completed.body.data.filePath}.music-hub-meta.json`), false);

      const bytes = await fs.readFile(completed.body.data.filePath);
      assert.equal(bytes.subarray(0, 3).toString('ascii'), 'ID3');
      assert.ok(bytes.includes(Buffer.from('TIT2')));
      assert.ok(bytes.includes(Buffer.from('TPE1')));
      assert.ok(bytes.includes(Buffer.from('TALB')));
      assert.ok(bytes.includes(Buffer.from('USLT')));
      assert.ok(bytes.includes(Buffer.from('APIC')));
    }, { files: [], root: `${tempRoot}-download-embed` });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('builtin cover download fetches a real cover for 紅蓮華', { timeout: 90000 }, async () => {
  await withRealSourceEnv(async root => {
    const { httpHandler } = await createTestHandlers();
    const search = await invokeHttp(httpHandler, 'POST', '/music/search', { keyword, source: 'tx', page: 1, limit: 5 });
    assert.equal(search.statusCode, 200);
    const song = search.body.data.results[0].list.find(item => item.name === keyword && /LiSA/i.test(item.singer))
      || search.body.data.results[0].list[0];

    const cover = await invokeHttp(httpHandler, 'POST', '/covers/get', { songInfo: song });
    assert.equal(cover.statusCode, 200);
    assert.match(cover.body.data.url, /^https?:\/\//);
    assert.ok(['song', 'album', 'resource'].includes(cover.body.data.sourceType));

    const download = await invokeHttp(httpHandler, 'POST', '/covers/download', { songInfo: song, fileName: 'gurenge-cover.jpg' });
    assert.equal(download.statusCode, 200);
    assert.match(download.body.data.url, /^https?:\/\//);
    assert.ok(['song', 'album', 'resource'].includes(download.body.data.sourceType));
    assert.ok(await fspExists(download.body.data.filePath));
    const stat = await fs.stat(download.body.data.filePath);
    assert.ok(stat.size > 1024, 'downloaded cover should contain image bytes');
    assert.equal(path.dirname(download.body.data.filePath), path.join(root, 'downloads'));
  }, { files: [], root: `${tempRoot}-cover-download` });
});

const searchFirstSong = async httpHandler => {
  const sources = await invokeHttp(httpHandler, 'GET', '/sources');
  const source = sources.body.data.find(item => item.id === realSource.id);
  const platform = source.platforms?.[0] || 'kw';
  const search = await invokeHttp(httpHandler, 'POST', '/music/search', { keyword, source: platform, page: 1, limit: 2 });
  assert.equal(search.statusCode, 200);
  return search.body.data.results.find(item => item.source === platform).list[0];
};

const downloadComboSource = port => `
module.exports = {
  name: 'Download Combo Source',
  supportedQualities: ['128k', '320k', 'flac'],
  capabilities: ['url'],
  platforms: ['kw', 'kg', 'tx'],
  lxSources: ['kw', 'kg', 'tx'],
  getMusicUrl(songInfo, quality) {
    const platform = songInfo.source;
    const type = quality || '320k';
    return {
      url: 'http://127.0.0.1:${port}/unstable?platform=' + platform + '&quality=' + type,
      type,
      provider: 'download-combo-source'
    };
  }
};
`;

const downloadEmbedSource = port => `
module.exports = {
  name: 'Download Embed Source',
  supportedQualities: ['128k'],
  capabilities: ['url', 'lyric', 'cover'],
  platforms: ['kw'],
  lxSources: ['kw'],
  getMusicUrl(songInfo, quality) {
    return { url: 'http://127.0.0.1:${port}/song.mp3', type: quality || '128k', provider: 'download-embed-source' };
  },
  getLyric() {
    return { lyric: '[00:00.000]紅蓮華', tlyric: '[00:00.000]红莲华', rlyric: '[00:00.000]gurenge', lxlyric: '' };
  },
  getCover() {
    return { url: 'http://127.0.0.1:${port}/cover.png', sourceType: 'song', provider: 'download-embed-source' };
  }
};
`;

const png1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
  '0d0a2db40000000049454e44ae426082',
  'hex'
);
