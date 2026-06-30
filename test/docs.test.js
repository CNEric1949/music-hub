import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestHandlers,
  invokeHttp,
  tempRoot,
  withRealSourceEnv
} from './support/helpers.js';

test('HTTP docs expose OpenAPI only at /api-docs', async () => {
  await withRealSourceEnv(async () => {
    const { httpHandler } = await createTestHandlers();

    const openApi = await invokeHttp(httpHandler, 'GET', '/openapi.json');
    assert.equal(openApi.statusCode, 200);
    assert.equal(openApi.body.openapi, '3.1.0');
    assert.ok(openApi.body.paths['/config']);
    assert.ok(openApi.body.paths['/music/url']);
    assert.equal(openApi.body.paths['/music/urls'], undefined);
    assert.equal(openApi.body.components.schemas.SearchInput.properties.keyword.type, 'string');
    assert.ok(openApi.body.paths['/downloads'].post.requestBody);
    assert.ok(openApi.body.paths['/downloads/{id}'].delete);

    const apiDocs = await invokeHttp(httpHandler, 'GET', '/api-docs');
    assert.equal(apiDocs.statusCode, 200);
    assert.match(apiDocs.body, /SwaggerUIBundle/);

    const config = await invokeHttp(httpHandler, 'GET', '/config');
    assert.equal(config.statusCode, 200);
    assert.equal(config.body.data.download.qualityStrategy, 'specified');
    assert.equal(config.body.data.download.retryCount, 3);
    assert.equal(config.body.data.download.retryIntervalMs, 5000);

    const updatedConfig = await invokeHttp(httpHandler, 'PATCH', '/config', {
      download: { quality: '128k', qualityStrategy: 'lowest', sourceStrategy: 'all', retryCount: 2, retryIntervalMs: 250 }
    });
    assert.equal(updatedConfig.statusCode, 200);
    assert.equal(updatedConfig.body.data.download.quality, '128k');
    assert.equal(updatedConfig.body.data.download.qualityStrategy, 'lowest');
    assert.equal(updatedConfig.body.data.download.sourceStrategy, 'all');
    assert.equal(updatedConfig.body.data.download.retryCount, 2);
    assert.equal(updatedConfig.body.data.download.retryIntervalMs, 250);

    const docs = await invokeHttp(httpHandler, 'GET', '/docs');
    assert.equal(docs.statusCode, 404);

    const httpMcpDocs = await invokeHttp(httpHandler, 'GET', '/mcp/docs');
    assert.equal(httpMcpDocs.statusCode, 404);
    assert.equal(httpMcpDocs.body.error.code, 'VALIDATION_ERROR');
  }, { files: [], root: `${tempRoot}-docs` });
});

test('MCP docs and tool schemas are exposed on MCP handler', async () => {
  await withRealSourceEnv(async () => {
    const { mcpHandler } = await createTestHandlers();

    const tools = await invokeHttp(mcpHandler, 'GET', '/mcp/tools');
    assert.equal(tools.statusCode, 200);
    assert.ok(tools.body.tools.find(tool => tool.name === 'get_config').inputSchema);
    assert.ok(tools.body.tools.find(tool => tool.name === 'update_config').inputSchema.properties.download);
    assert.ok(tools.body.tools.find(tool => tool.name === 'get_music_url').inputSchema.properties.songInfo);
    assert.equal(tools.body.tools.some(tool => tool.name === 'get_music_urls'), false);
    assert.equal(tools.body.tools.some(tool => tool.name === 'upgrade_music_source'), false);

    const docs = await invokeHttp(mcpHandler, 'GET', '/mcp/docs');
    assert.equal(docs.statusCode, 200);
    assert.match(docs.body, /music-hub MCP Tools/);
  }, { files: [], root: `${tempRoot}-mcp-docs` });
});
