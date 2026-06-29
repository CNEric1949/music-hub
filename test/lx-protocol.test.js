import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createTestHandlers,
  invokeHttp,
  tempRoot,
  withRealSourceEnv
} from './support/helpers.js';

test('LX user source protocol fixture covers request, actions, metadata, and update alerts', { timeout: 30000 }, async () => {
  await withRealSourceEnv(async () => {
    const seenRequests = [];
    const server = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      seenRequests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8')
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address();
      const { httpHandler } = await createTestHandlers();
      const code = lxFixtureSource(`http://127.0.0.1:${port}/probe`);

      const created = await invokeHttp(httpHandler, 'POST', '/sources', {
        id: 'lx-protocol-fixture',
        code
      });
      assert.equal(created.statusCode, 200);
      assert.equal(created.body.data.name, 'LX Protocol Fixture');
      assert.equal(created.body.data.version, '1.2.3');
      assert.deepEqual(created.body.data.platforms, ['kw', 'local']);
      assert.deepEqual(created.body.data.platformQualities.kw, ['128k', '320k']);
      assert.deepEqual(created.body.data.platformQualities.local, ['128k']);
      assert.deepEqual(created.body.data.capabilities.sort(), ['album', 'cover', 'detail', 'lyric', 'search', 'singer', 'url'].sort());

      const detail = await invokeHttp(httpHandler, 'GET', '/sources/lx-protocol-fixture');
      assert.equal(detail.body.data.update.available, true);
      assert.equal(detail.body.data.update.info.currentVersion, '1.2.3');
      assert.equal(detail.body.data.update.info.version, '1.2.4');
      assert.equal(detail.body.data.update.info.updateUrl, 'https://example.com/lx-protocol-fixture.js');

      const search = await invokeHttp(httpHandler, 'POST', '/music/search', {
        keyword: 'protocol song',
        source: 'lx-protocol-fixture',
        page: 1,
        limit: 2
      });
      assert.equal(search.statusCode, 200);
      assert.equal(search.body.data.results[0].list[0].name, 'protocol song');
      assert.equal(search.body.data.results[0].source, 'lx-protocol-fixture');
      assert.equal(search.body.data.results[0].list[0].source, 'kw');

      const songInfo = search.body.data.results[0].list[0];
      const musicUrl = await invokeHttp(httpHandler, 'POST', '/music/url', {
        songInfo,
        source: 'kw',
        quality: '320k'
      });
      assert.equal(musicUrl.statusCode, 200);
      assert.equal(musicUrl.body.data.url, 'https://example.com/kw-320k.mp3');
      assert.equal(musicUrl.body.data.type, '320k');

      const localUrl = await invokeHttp(httpHandler, 'POST', '/music/url', {
        songInfo: { ...songInfo, source: 'local' },
        source: 'local',
        quality: '320k'
      });
      assert.equal(localUrl.statusCode, 200);
      assert.equal(localUrl.body.data.url, 'https://example.com/local-local.mp3');
      assert.equal(localUrl.body.data.type, null);

      const lyric = await invokeHttp(httpHandler, 'POST', '/lyrics/get', { songInfo });
      assert.equal(lyric.statusCode, 200);
      assert.equal(lyric.body.data.lyric, '[00:00.000]protocol lyric');
      assert.equal(lyric.body.data.tlyric, '[00:00.000]translated');
      assert.equal(lyric.body.data.rlyric, '[00:00.000]roman');
      assert.equal(lyric.body.data.lxlyric, '[00:00.000]lx');

      const cover = await invokeHttp(httpHandler, 'POST', '/covers/get', { songInfo });
      assert.equal(cover.statusCode, 200);
      assert.equal(cover.body.data.url, 'https://example.com/cover.jpg');

      const album = await invokeHttp(httpHandler, 'POST', '/albums/detail', { source: 'kw', albumId: 'album-1' });
      assert.equal(album.statusCode, 200);
      assert.equal(album.body.data.albumId, 'album-1');

      const singer = await invokeHttp(httpHandler, 'POST', '/singers/detail', { source: 'kw', singerId: 'singer-1' });
      assert.equal(singer.statusCode, 200);
      assert.equal(singer.body.data.singerId, 'singer-1');

      const musicDetail = await invokeHttp(httpHandler, 'POST', '/music/detail', { source: 'kw', songInfo });
      assert.equal(musicDetail.statusCode, 200);
      assert.equal(musicDetail.body.data.songmid, 'fixture-mid');

      assert.equal(seenRequests.length, 1);
      assert.equal(seenRequests[0].method, 'POST');
      assert.equal(seenRequests[0].body, 'hello=world');
      assert.equal(seenRequests[0].headers['x-fixture'], 'yes');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }, { files: [], root: `${tempRoot}-lx-protocol` });
});

test('music URL resolving reports failures, orders qualities, and supports provider selection', { timeout: 30000 }, async () => {
  await withRealSourceEnv(async () => {
    const { httpHandler } = await createTestHandlers();
    await invokeHttp(httpHandler, 'POST', '/sources', {
      id: 'url-provider-a',
      code: urlProviderSource('Provider A', {
        '128k': 'https://example.com/a-128.mp3',
        '320k': 'https://example.com/a-320.mp3'
      })
    });
    await invokeHttp(httpHandler, 'POST', '/sources', {
      id: 'url-provider-b',
      code: urlProviderSource('Provider B', {
        '128k': 'https://example.com/b-128.mp3',
        '320k': null
      })
    });
    const songInfo = {
      source: 'kw',
      songmid: 'url-mid',
      name: 'URL Song',
      singer: 'Fixture',
      types: [{ type: '320k' }, { type: '128k' }]
    };

    const allProviders = await invokeHttp(httpHandler, 'POST', '/music/url', { songInfo, source: 'kw' });
    assert.equal(allProviders.statusCode, 200);
    assert.deepEqual(Object.keys(allProviders.body.data.results[0].urls), ['128k', '320k']);
    assert.equal(allProviders.body.data.results[0].urls['128k'].url, 'https://example.com/a-128.mp3');
    assert.deepEqual(allProviders.body.data.failures, []);

    const providerB = await invokeHttp(httpHandler, 'POST', '/music/url', { songInfo, source: 'kw', provider: 'url-provider-b', quality: '128k' });
    assert.equal(providerB.statusCode, 200);
    assert.equal(providerB.body.data.url, 'https://example.com/b-128.mp3');
    assert.equal(providerB.body.data.provider, 'url-provider-b');

    const unsupportedQuality = await invokeHttp(httpHandler, 'POST', '/music/url', { songInfo, source: 'kw', quality: 'flac' });
    assert.equal(unsupportedQuality.statusCode, 422);
    assert.equal(unsupportedQuality.body.error.code, 'QUALITY_UNSUPPORTED');

    const missing = await invokeHttp(httpHandler, 'POST', '/music/url', { songInfo, source: 'kw', provider: 'url-provider-b', quality: '320k' });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.body.error.code, 'MUSIC_NOT_FOUND');
    assert.equal(missing.body.error.details.failures[0].provider, 'url-provider-b');
  }, { files: [], root: `${tempRoot}-url-resolve` });
});

test('custom source runtime supports module.exports without waiting for inited event', { timeout: 30000 }, async () => {
  await withRealSourceEnv(async () => {
    const { httpHandler } = await createTestHandlers();
    const started = Date.now();
    const created = await invokeHttp(httpHandler, 'POST', '/sources', {
      id: 'module-export-source',
      code: `
        module.exports = {
          name: 'Module Export Source',
          version: '0.0.1',
          supportedQualities: ['128k'],
          capabilities: ['search'],
          search(options) {
            return {
              list: [{ source: 'module-export-source', name: options.keyword, singer: 'Fixture' }],
              total: 1,
              limit: options.limit
            }
          }
        }
      `
    });
    assert.equal(created.statusCode, 200);
    assert.equal(created.body.data.name, 'Module Export Source');
    assert.equal(created.body.data.initialized, true);
    assert.ok(Date.now() - started < 1000, 'module.exports source should not wait for init timeout');

    const search = await invokeHttp(httpHandler, 'POST', '/music/search', {
      keyword: 'module song',
      source: 'module-export-source',
      limit: 1
    });
    assert.equal(search.statusCode, 200);
    assert.equal(search.body.data.results[0].list[0].name, 'module song');
  }, { files: [], root: `${tempRoot}-module-export` });
});

const lxFixtureSource = requestUrl => `
// ==UserScript==
// @name LX Protocol Fixture
// @version 1.2.3
// @author music-hub
// @description protocol fixture
// @homepage https://example.com
// @updateUrl https://example.com/lx-protocol-fixture.js
// ==/UserScript==

const calls = []
lx.request('${requestUrl}', {
  method: 'POST',
  headers: { 'X-Fixture': 'yes' },
  form: { hello: 'world' }
}, (error, response, body) => {
  if (error) throw error
  calls.push({ status: response.statusCode, body })
  lx.send(lx.EVENT_NAMES.updateAlert, {
    version: '1.2.4',
    updateUrl: 'https://example.com/lx-protocol-fixture.js',
    log: 'fixture update',
    confirmText: 'update',
    cancelText: 'later'
  })
  lx.send(lx.EVENT_NAMES.updateAlert, {
    version: '9.9.9',
    updateUrl: 'https://example.com/ignored.js',
    log: 'ignored update'
  })
  lx.send(lx.EVENT_NAMES.inited, {
    sources: {
      kw: {
        name: 'KW',
        type: 'music',
        actions: ['search', 'musicUrl', 'lyric', 'pic', 'album', 'singer', 'musicDetail'],
        qualitys: ['128k', '320k']
      },
      local: {
        name: 'Local',
        type: 'music',
        actions: ['musicUrl'],
        qualities: ['128k']
      }
    }
  })
})

lx.on(lx.EVENT_NAMES.request, ({ action, source, info }) => {
  if (action === 'search') {
    return {
      data: [{
        source: 'kw',
        songmid: 'fixture-mid',
        name: info.keyword,
        singer: 'Fixture Singer',
        albumName: 'Fixture Album',
        albumId: 'album-1',
        interval: '03:21',
        img: 'https://example.com/cover.jpg',
        types: [{ type: '128k' }, { type: '320k' }],
        meta: { actionSource: info.source }
      }],
      total: 1,
      pageCount: 1,
      limit: info.limit
    }
  }
  if (action === 'musicUrl') {
    return { url: 'https://example.com/' + source + '-' + (info.type == null ? 'local' : info.type) + '.mp3', type: info.type }
  }
  if (action === 'lyric') {
    return {
      lrc: '[00:00.000]protocol lyric',
      tlrc: '[00:00.000]translated',
      rlrc: '[00:00.000]roman',
      awlyric: '[00:00.000]lx'
    }
  }
  if (action === 'pic') return { pic: 'https://example.com/cover.jpg' }
  if (action === 'album') return { albumId: info.albumId, name: 'Fixture Album' }
  if (action === 'singer') return { singerId: info.singerId, name: 'Fixture Singer' }
  if (action === 'musicDetail') return { ...info.songInfo, detail: true }
  return null
})
`;

const urlProviderSource = (name, urls) => `
lx.send(lx.EVENT_NAMES.inited, {
  sources: {
    kw: {
      name: 'KW',
      type: 'music',
      actions: ['musicUrl'],
      qualitys: ['128k', '320k']
    }
  }
})

lx.on(lx.EVENT_NAMES.request, ({ action, info }) => {
  if (action !== 'musicUrl') return null
  const urls = ${JSON.stringify(urls)}
  const url = urls[info.type]
  return url ? { url, type: info.type, providerName: ${JSON.stringify(name)} } : null
})
`;
