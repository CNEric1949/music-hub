import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app.js';
import { startHttpServer } from '../src/server/http/index.js';
import { startMcpServer } from '../src/server/mcp/index.js';
import {
  projectRoot,
  tempRoot,
  withRealSourceEnv
} from './support/helpers.js';

test('HTTP and MCP servers listen on configured ports and handle network requests', { timeout: 30000 }, async () => {
  await withRealSourceEnv(async () => {
    const app = await createApp();
    const httpServer = await startHttpServer(app);
    const mcpServer = await startMcpServer(app);
    try {
      const httpBase = `http://127.0.0.1:${httpServer.address().port}`;
      const mcpBase = `http://127.0.0.1:${mcpServer.address().port}`;

      const health = await fetchJson(`${httpBase}/health`);
      assert.equal(health.status, 200);
      assert.equal(health.body.ok, true);
      assert.equal(health.body.data.status, 'ok');

      const openApi = await fetchJson(`${httpBase}/openapi.json`);
      assert.equal(openApi.status, 200);
      assert.equal(openApi.body.openapi, '3.1.0');
      assert.ok(openApi.body.paths['/sources']);

      const streamableClient = await connectMcpClient(
        new StreamableHTTPClientTransport(new URL(`${mcpBase}/mcp`))
      );
      const streamableTools = await streamableClient.listTools();
      assert.ok(streamableTools.tools.some(tool => tool.name === 'search_music'));
      assert.ok(streamableTools.tools.some(tool => tool.name === 'enable_music_source'));
      await streamableClient.close();

      const sseClient = await connectMcpClient(
        new SSEClientTransport(new URL(`${mcpBase}/mcp`))
      );
      const sseTools = await sseClient.listTools();
      assert.ok(sseTools.tools.some(tool => tool.name === 'search_music'));
      assert.ok(sseTools.tools.some(tool => tool.name === 'enable_music_source'));
      await sseClient.close();

      const stdioTransport = new StdioClientTransport({
        command: process.execPath,
        args: ['src/index.js', 'stdio'],
        cwd: projectRoot,
        env: { ...process.env },
        stderr: 'pipe'
      });
      stdioTransport.stderr?.resume();
      const stdioClient = await connectMcpClient(stdioTransport);
      const stdioTools = await stdioClient.listTools();
      assert.ok(stdioTools.tools.some(tool => tool.name === 'search_music'));
      assert.ok(stdioTools.tools.some(tool => tool.name === 'enable_music_source'));
      await stdioClient.close();

      const mcpDocs = await fetchText(`${mcpBase}/mcp/docs`);
      assert.equal(mcpDocs.status, 200);
      assert.match(mcpDocs.body, /music-hub MCP Tools/);
    } finally {
      await Promise.all([
        closeServer(httpServer),
        closeServer(mcpServer)
      ]);
    }
  }, {
    files: [],
    root: `${tempRoot}-server-listen`,
    env: {
      MUSIC_HUB_HOST: '127.0.0.1',
      MUSIC_HUB_PORT: '0',
      MUSIC_HUB_MCP_HOST: '127.0.0.1',
      MUSIC_HUB_MCP_PORT: '0'
    }
  });
});

const connectMcpClient = async transport => {
  const client = new Client({ name: 'music-hub-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  return {
    status: response.status,
    body: await response.json()
  };
};

const fetchText = async (url, options) => {
  const response = await fetch(url, options);
  return {
    status: response.status,
    body: await response.text()
  };
};

const closeServer = server => new Promise((resolve, reject) => {
  server.close(error => {
    if (error) reject(error);
    else resolve();
  });
});
