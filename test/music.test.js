import test from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinPlatforms,
  createTestHandlers,
  getRealSource,
  invokeHttp,
  invokeMcp,
  keyword,
  qualitiesText,
  tempRoot,
  withRealSourceEnv
} from './support/helpers.js';

const realSource = getRealSource(file => file.includes('最新'));

test('real source search, match, media URL, lyric, cover, and detail capability handling', { skip: !realSource.path, timeout: 90000 }, async () => {
  await withRealSourceEnv(async () => {
    const { httpHandler, mcpHandler } = await createTestHandlers();
    const source = await getInitializedSource(httpHandler);
    const platforms = source.platforms?.length ? source.platforms : builtinPlatforms;

    console.log(`[source] file=${realSource.fileName}`);
    console.log(`[source] id=${source.id}`);
    console.log(`[source] initialized=${source.initialized} status=${source.status}`);
    console.log(`[source] platforms=${platforms.join(', ')}`);
    for (const platform of platforms) {
      const qualities = source.platformQualities?.[platform] || source.supportedQualities || [];
      console.log(`[source] ${platform} qualities=${qualitiesText(qualities)}`);
      assert.ok(qualities.length > 0, `${platform} should declare qualities`);
    }

    const mcpList = await invokeMcp(mcpHandler, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const toolNames = mcpList.result.tools.map(tool => tool.name);
    for (const name of [
      'list_music_sources',
      'get_music_source',
      'enable_music_source',
      'disable_music_source',
      'search_music',
      'match_music',
      'get_music_url',
      'create_download_task'
    ]) {
      assert.ok(toolNames.includes(name), `MCP tool missing: ${name}`);
    }
    const mcpSearchTool = mcpList.result.tools.find(tool => tool.name === 'search_music');
    assert.equal(mcpSearchTool.inputSchema.properties.keyword.type, 'string');
    assert.ok(mcpSearchTool.inputSchema.$defs.SongInfo);

    const searchByPlatform = new Map();
    for (const platform of platforms) {
      const response = await invokeHttp(httpHandler, 'POST', '/music/search', { keyword, source: platform, page: 1, limit: 5 });
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.ok, true);
      assert.equal(response.body.data.failures.length, 0, JSON.stringify(response.body.data.failures, null, 2));
      const group = response.body.data.results.find(item => item.source === platform);
      assert.ok(group?.list?.length > 0, `${platform} should return search results`);
      if (platform !== 'mg') {
        assert.ok(group.list.some(item => String(item.name || '').includes(keyword)), `${platform} results should contain ${keyword}`);
      }
      searchByPlatform.set(platform, group.list);
      console.log(`[search:http] ${platform} count=${group.list.length}`);
      for (const item of group.list.slice(0, 2)) {
        console.log(`[search:http] ${platform} - ${item.name} / ${item.singer} / ${qualitiesText(item.types?.map(type => type.type))}`);
      }
    }

    const allSearch = await invokeHttp(httpHandler, 'POST', '/music/search', { keyword, source: 'all', page: 1, limit: 3 });
    assert.equal(allSearch.statusCode, 200);
    assert.equal(allSearch.body.ok, true);
    for (const platform of platforms) {
      assert.ok(allSearch.body.data.results.some(item => item.source === platform), `all search should include ${platform}`);
    }

    const firstPlatform = platforms[0];
    const pageOne = await invokeHttp(httpHandler, 'POST', '/music/search', { keyword, source: firstPlatform, page: 1, limit: 2 });
    const pageTwo = await invokeHttp(httpHandler, 'POST', '/music/search', { keyword, source: firstPlatform, page: 2, limit: 2 });
    assert.equal(pageOne.statusCode, 200);
    assert.equal(pageTwo.statusCode, 200);
    const pageOneGroup = pageOne.body.data.results.find(item => item.source === firstPlatform);
    const pageTwoGroup = pageTwo.body.data.results.find(item => item.source === firstPlatform);
    assert.equal(pageOneGroup.limit, 2);
    assert.equal(pageTwoGroup.limit, 2);
    assert.ok(pageOneGroup.list.length > 0);
    assert.ok(pageTwoGroup.list.length > 0);
    assert.notDeepEqual(pageTwoGroup.list.map(item => item.songmid || item.songId || item.name), pageOneGroup.list.map(item => item.songmid || item.songId || item.name));

    const firstSong = searchByPlatform.get(firstPlatform)[0];
    const matched = await invokeHttp(httpHandler, 'POST', '/music/match', {
      name: firstSong.name,
      singer: firstSong.singer,
      albumName: firstSong.albumName,
      interval: firstSong.interval,
      source: firstSong.source,
      limit: 5
    });
    assert.equal(matched.statusCode, 200);
    assert.equal(matched.body.ok, true);
    assert.ok(Array.isArray(matched.body.data.list));

    const mcpSearch = await invokeMcp(mcpHandler, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'search_music', arguments: { keyword, source: firstPlatform, page: 1, limit: 2 } }
    });
    assert.ok(mcpSearch.result.structuredContent.results[0].list.length > 0);
    assert.equal(mcpSearch.result.structuredContent.results[0].limit, 2);

    const urlResponse = await invokeHttp(httpHandler, 'POST', '/music/url', {
      songInfo: firstSong,
      source: firstSong.source,
      quality: firstSong.types?.[0]?.type || '128k'
    });
    assert.equal(urlResponse.statusCode, 200);
    assert.equal(urlResponse.body.ok, true);
    assert.match(urlResponse.body.data.url, /^https?:\/\//);
    console.log(`[url:http] ${firstSong.source} ${firstSong.name} ${urlResponse.body.data.type || ''}`);

    const mcpUrl = await invokeMcp(mcpHandler, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'get_music_url',
        arguments: { songInfo: firstSong, source: firstSong.source, quality: firstSong.types?.[0]?.type || '128k' }
      }
    });
    assert.match(mcpUrl.result.structuredContent.url, /^https?:\/\//);

    const singleQualitySong = { ...firstSong, types: firstSong.types?.slice(0, 1) };
    const urlsResponse = await invokeHttp(httpHandler, 'POST', '/music/url', { songInfo: singleQualitySong });
    assert.equal(urlsResponse.statusCode, 200);
    assert.ok(hasResolvedUrl(urlsResponse.body.data));

    const mcpUrls = await invokeMcp(mcpHandler, {
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: { name: 'get_music_url', arguments: { songInfo: singleQualitySong } }
    });
    assert.ok(hasResolvedUrl(mcpUrls.result.structuredContent));

    const lyricResponse = await invokeHttp(httpHandler, 'POST', '/lyrics/get', { songInfo: firstSong });
    assert.equal(lyricResponse.statusCode, 200);
    assert.ok('lyric' in lyricResponse.body.data);

    const coverResponse = await invokeHttp(httpHandler, 'POST', '/covers/get', { songInfo: firstSong });
    assert.equal(coverResponse.statusCode, 200);
    assert.ok('url' in coverResponse.body.data);
    if (coverResponse.body.data.sourceType) {
      assert.ok(['song', 'album', 'resource', 'custom'].includes(coverResponse.body.data.sourceType));
    }

    await assertRealDetail(httpHandler, source, firstSong, 'album');
    await assertRealDetail(httpHandler, source, firstSong, 'singer');
    await assertRealDetail(httpHandler, source, firstSong, 'detail');

    const unsupportedAlbum = await invokeHttp(httpHandler, 'POST', '/albums/detail', { source: 'wy', albumId: 'dummy' });
    assert.equal(unsupportedAlbum.statusCode, 422);
    assert.equal(unsupportedAlbum.body.error.code, 'SOURCE_CAPABILITY_UNSUPPORTED');
  }, { files: [realSource.fileName], root: `${tempRoot}-music` });
});

const getInitializedSource = async httpHandler => {
  const httpSources = await invokeHttp(httpHandler, 'GET', '/sources');
  assert.equal(httpSources.statusCode, 200);
  const source = httpSources.body.data.find(item => item.id === realSource.id);
  assert.ok(source, `source ${realSource.id} should be listed`);
  assert.equal(source.initialized, true, source.error || 'real source should initialize');

  const detail = await invokeHttp(httpHandler, 'GET', `/sources/${encodeURIComponent(realSource.id)}`);
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.body.data.id, realSource.id);
  assert.equal(detail.body.data.initialized, true);
  return source;
};

const hasResolvedUrl = value => {
  if (Array.isArray(value?.results)) {
    return value.results.some(group => Object.values(group.urls || {}).some(item => /^https?:\/\//.test(item?.url || '')));
  }
  return Object.values(value).some(group =>
    Object.values(group).some(item => /^https?:\/\//.test(item?.url || ''))
  );
};

const assertRealDetail = async (httpHandler, source, song, capability) => {
  if (!source.capabilities?.includes(capability)) return;
  const routes = {
    album: '/albums/detail',
    singer: '/singers/detail',
    detail: '/music/detail'
  };
  const payloads = {
    album: {
      source: song.source,
      albumId: song.albumId || song.albumMid || song.album_id,
      albumName: song.albumName,
      songInfo: song
    },
    singer: {
      source: song.source,
      singerId: song.singerId || song.singerMid || song.singer_mid,
      singer: song.singer,
      songInfo: song
    },
    detail: {
      source: song.source,
      songInfo: song
    }
  };
  const response = await invokeHttp(httpHandler, 'POST', routes[capability], payloads[capability]);
  assert.equal(response.statusCode, 200, JSON.stringify(response.body, null, 2));
  assert.equal(response.body.ok, true);
  assert.equal(typeof response.body.data, 'object');
  assert.ok(Object.keys(response.body.data || {}).length > 0, `${capability} detail should return data`);
  console.log(`[detail:http] ${capability} source=${song.source}`);
};
