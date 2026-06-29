import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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
      options: { embedCover: false, embedLyric: true, saveLyricFile: true }
    });
    assert.equal(localDownload.statusCode, 200);
    await fs.writeFile(localDownload.body.data.filePath, sourceBytes.subarray(0, 37));

    const resumedDownload = await invokeHttp(httpHandler, 'POST', `/downloads/${localDownload.body.data.id}/resume`);
    assert.equal(resumedDownload.statusCode, 200);
    assert.equal(resumedDownload.body.data.status, 'completed');
    assert.deepEqual(await fs.readFile(localDownload.body.data.filePath), sourceBytes);
    assert.ok(await fspExists(`${localDownload.body.data.filePath}.music-hub-meta.json`));

    const downloadFiles = await fs.readdir(path.join(root, 'downloads'));
    assert.ok(downloadFiles.some(file => file.endsWith('.lrc')));
  }, { files: [realSource.fileName], root: `${tempRoot}-download-resume` });
});

const searchFirstSong = async httpHandler => {
  const sources = await invokeHttp(httpHandler, 'GET', '/sources');
  const source = sources.body.data.find(item => item.id === realSource.id);
  const platform = source.platforms?.[0] || 'kw';
  const search = await invokeHttp(httpHandler, 'POST', '/music/search', { keyword, source: platform, page: 1, limit: 2 });
  assert.equal(search.statusCode, 200);
  return search.body.data.results.find(item => item.source === platform).list[0];
};
