import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {
  createTestHandlers,
  getRealSource,
  invokeHttp,
  invokeMcp,
  realSourceFiles,
  tempRoot,
  withRealSourceEnv
} from './support/helpers.js';

const latestSource = getRealSource(file => file.includes('最新'));
const upgradableSource = getRealSource(file => file.includes('可升级'));

test('sources initialize concurrently and expose update prompt state', { skip: realSourceFiles.length < 2, timeout: 90000 }, async () => {
  await withRealSourceEnv(async () => {
    const { httpHandler, mcpHandler } = await createTestHandlers();

    const response = await invokeHttp(httpHandler, 'GET', '/sources');
    assert.equal(response.statusCode, 200);
    const latest = response.body.data.find(item => item.id === latestSource.id);
    const upgradable = response.body.data.find(item => item.id === upgradableSource.id);
    assert.equal(latest?.initialized, true, latest?.error || 'latest source should init');
    assert.equal(upgradable?.initialized, true, upgradable?.error || 'upgradable source should init');
    assert.equal(latest.update.available, false);
    const upgradableWithAlert = await waitForUpdate(httpHandler, upgradableSource.id);
    assert.equal(upgradableWithAlert.update.available, true);
    assert.match(upgradableWithAlert.update.message, /星海音乐源更新通知|当前版本|最新版本/);
    assert.ok(upgradableWithAlert.update.info.updateUrl);

    const mcpSource = await invokeMcp(mcpHandler, {
      jsonrpc: '2.0',
      id: 99,
      method: 'tools/call',
      params: { name: 'get_music_source', arguments: { id: latestSource.id } }
    });
    assert.equal(mcpSource.result.structuredContent.id, latestSource.id);

    const checkUpdate = await invokeHttp(httpHandler, 'POST', `/sources/${encodeURIComponent(upgradableSource.id)}/check-update`);
    assert.equal(checkUpdate.statusCode, 200);
    assert.equal(checkUpdate.body.data.id, upgradableSource.id);
    assert.equal(checkUpdate.body.data.available, true);
    assert.match(checkUpdate.body.data.message, /当前版本/);
    assert.ok(checkUpdate.body.data.updateUrl);

    const mcpUpdate = await invokeMcp(mcpHandler, {
      jsonrpc: '2.0',
      id: 100,
      method: 'tools/call',
      params: { name: 'check_music_source_update', arguments: { id: upgradableSource.id } }
    });
    assert.equal(mcpUpdate.result.structuredContent.available, true);
  }, { files: [latestSource.fileName, upgradableSource.fileName] });
});

test('sources support enable, disable, reload, and do not expose upgrade execution', { skip: !latestSource.path, timeout: 90000 }, async () => {
  await withRealSourceEnv(async () => {
    const { httpHandler, mcpHandler } = await createTestHandlers();

    const disabled = await invokeHttp(httpHandler, 'POST', `/sources/${encodeURIComponent(latestSource.id)}/disable`);
    assert.equal(disabled.statusCode, 200);
    assert.equal(disabled.body.data.enabled, false);
    assert.equal(disabled.body.data.initialized, false);

    const enabled = await invokeHttp(httpHandler, 'POST', `/sources/${encodeURIComponent(latestSource.id)}/enable`);
    assert.equal(enabled.statusCode, 200);
    assert.equal(enabled.body.data.enabled, true);
    assert.equal(enabled.body.data.initialized, true);

    const reloaded = await invokeHttp(httpHandler, 'POST', '/sources/reload', { id: latestSource.id });
    assert.equal(reloaded.statusCode, 200);
    assert.equal(reloaded.body.data.id, latestSource.id);
    assert.equal(reloaded.body.data.initialized, true);

    const mcpReloaded = await invokeMcp(mcpHandler, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'reload_music_sources', arguments: { id: latestSource.id } }
    });
    assert.equal(mcpReloaded.result.structuredContent.id, latestSource.id);

    const tools = await invokeMcp(mcpHandler, { jsonrpc: '2.0', id: 103, method: 'tools/list' });
    assert.equal(tools.result.tools.some(tool => tool.name === 'upgrade_music_source'), false);
  }, { files: [latestSource.fileName], root: `${tempRoot}-source-state` });
});

test('single-source mode initializes only one custom source', { skip: realSourceFiles.length < 2, timeout: 90000 }, async () => {
  await withRealSourceEnv(async () => {
    const { httpHandler } = await createTestHandlers();
    const response = await invokeHttp(httpHandler, 'GET', '/sources');
    const custom = response.body.data.filter(item => item.type === 'custom');
    assert.equal(custom.filter(item => item.initialized).length, 1);
    assert.ok(custom.some(item => item.status === 'inactive' && item.initMessage === 'multiSourceEnabled=false'));
  }, { files: [latestSource.fileName, upgradableSource.fileName], root: `${tempRoot}-single-source`, multiSourceEnabled: false });
});

test('sources support local file and online import, detail, delete', { skip: !latestSource.path, timeout: 90000 }, async () => {
  await withRealSourceEnv(async root => {
    const { httpHandler, mcpHandler } = await createTestHandlers();

    const localImport = await invokeHttp(httpHandler, 'POST', '/sources', {
      id: 'local-upload-source',
      filePath: latestSource.path
    });
    assert.equal(localImport.statusCode, 200);
    assert.equal(localImport.body.data.id, 'local-upload-source');
    assert.equal(localImport.body.data.initialized, true);

    const updated = await invokeMcp(mcpHandler, {
      jsonrpc: '2.0',
      id: 104,
      method: 'tools/call',
      params: {
        name: 'update_music_source',
        arguments: { id: 'local-upload-source', name: 'Local Upload Source Updated' }
      }
    });
    assert.equal(updated.result.structuredContent.name, 'Local Upload Source Updated');

    const server = http.createServer(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(latestSource.code);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address();
      const onlineImport = await invokeHttp(httpHandler, 'POST', '/sources', {
        id: 'online-import-source',
        url: `http://127.0.0.1:${port}/source.js`
      });
      assert.equal(onlineImport.statusCode, 200);
      assert.equal(onlineImport.body.data.id, 'online-import-source');
      assert.equal(onlineImport.body.data.initialized, true);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }

    const detail = await invokeHttp(httpHandler, 'GET', '/sources/local-upload-source');
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.body.data.id, 'local-upload-source');
    assert.equal(await exists(path.join(root, 'sources', 'local-upload-source.js')), true);

    const deleted = await invokeMcp(mcpHandler, {
      jsonrpc: '2.0',
      id: 101,
      method: 'tools/call',
      params: { name: 'delete_music_source', arguments: { id: 'local-upload-source' } }
    });
    assert.equal(deleted.result.structuredContent.deleted, true);

    const afterDelete = await invokeHttp(httpHandler, 'GET', '/sources/local-upload-source');
    assert.equal(afterDelete.statusCode, 404);
    assert.equal(await exists(path.join(root, 'sources', 'local-upload-source.js')), false);
  }, { files: [], root: `${tempRoot}-source-import` });
});

const exists = async target => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const waitForUpdate = async (httpHandler, id) => {
  const deadline = Date.now() + 15000;
  let last = null;
  while (Date.now() < deadline) {
    const response = await invokeHttp(httpHandler, 'GET', `/sources/${encodeURIComponent(id)}`);
    last = response.body.data;
    if (last.update?.available) return last;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return last;
};
