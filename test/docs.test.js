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
    assert.ok(openApi.body.paths['/music/url']);
    assert.equal(openApi.body.components.schemas.SearchInput.properties.keyword.type, 'string');
    assert.ok(openApi.body.paths['/downloads'].post.requestBody);

    const apiDocs = await invokeHttp(httpHandler, 'GET', '/api-docs');
    assert.equal(apiDocs.statusCode, 200);
    assert.match(apiDocs.body, /SwaggerUIBundle/);

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
    assert.ok(tools.body.tools.find(tool => tool.name === 'get_music_url').inputSchema.properties.songInfo);
    assert.equal(tools.body.tools.some(tool => tool.name === 'upgrade_music_source'), false);

    const docs = await invokeHttp(mcpHandler, 'GET', '/mcp/docs');
    assert.equal(docs.statusCode, 200);
    assert.match(docs.body, /music-hub MCP Tools/);
  }, { files: [], root: `${tempRoot}-mcp-docs` });
});
