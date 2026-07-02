import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  isInitializeRequest,
  ListToolsRequestSchema,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { createTools, listTools } from './tools.js';

const SERVER_INFO = { name: 'music-hub', version: '0.1.0' };
const SSE_MESSAGE_ENDPOINT = '/messages';

const readJson = async req => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const sendJson = (res, body, status = 200) => {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data)
  });
  res.end(data);
};

const sendHtml = (res, html) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html)
  });
  res.end(html);
};

export const createMcpDocsHtml = tools => {
  const rows = listTools(tools).map(tool => `
    <section>
      <h2>${tool.name}</h2>
      <p>${tool.description || ''}</p>
      <pre>${JSON.stringify(tool.inputSchema || {}, null, 2)}</pre>
    </section>
  `).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>music-hub MCP Tools</title>
  <style>
    body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #1f2937; background: #f8fafc; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px; }
    h1 { margin: 0 0 20px; font-size: 28px; }
    section { margin: 0 0 16px; padding: 16px; background: #fff; border: 1px solid #dbe3ef; border-radius: 8px; }
    h2 { margin: 0 0 8px; font-size: 18px; }
    p { margin: 0 0 12px; }
    pre { overflow: auto; padding: 12px; background: #0f172a; color: #e5e7eb; border-radius: 6px; }
  </style>
</head>
<body>
  <main>
    <h1>music-hub MCP Tools</h1>
    ${rows}
  </main>
</body>
</html>`;
};

export const createProtocolServer = tools => {
  const server = new Server(SERVER_INFO, {
    capabilities: {
      tools: {}
    },
    instructions: 'Use music-hub tools to manage LX music sources, search music, resolve URLs, fetch lyrics/covers, and manage downloads.'
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listTools(tools)
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const tool = tools[request.params.name];
    if (!tool) throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${request.params.name}`);
    try {
      const result = await tool.handler(request.params.arguments || {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result && typeof result === 'object' && !Array.isArray(result)
          ? result
          : { result }
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error.message || String(error) }],
        isError: true,
        structuredContent: {
          code: error.code || 'TOOL_ERROR',
          message: error.message || String(error),
          details: error.details || {}
        }
      };
    }
  });

  return server;
};

export const startMcpServer = app => new Promise(resolve => {
  const tools = createTools(app);
  const handler = createMcpHandler(tools);
  const server = http.createServer(handler);

  server.listen(app.config.server.mcpPort, app.config.server.mcpHost, () => {
    const address = server.address();
    const host = typeof address === 'object' && address ? address.address : app.config.server.mcpHost;
    const port = typeof address === 'object' && address ? address.port : app.config.server.mcpPort;
    console.log(`[MCP] listening on http://${host}:${port}/mcp`);
    resolve(server);
  });
});

export const startStdioMcpServer = async app => {
  const tools = createTools(app);
  const server = createProtocolServer(tools);
  await server.connect(new StdioServerTransport());
};

export const createMcpHandler = tools => {
  const transports = new Map();
  const servers = new Map();

  const connectTransport = async (transport, sessionId) => {
    const server = createProtocolServer(tools);
    if (sessionId) servers.set(sessionId, server);
    await server.connect(transport);
    return server;
  };

  const handleLegacySse = async (req, res) => {
    const transport = new SSEServerTransport(SSE_MESSAGE_ENDPOINT, res);
    transports.set(transport.sessionId, transport);
    transport.onclose = () => {
      transports.delete(transport.sessionId);
      const server = servers.get(transport.sessionId);
      servers.delete(transport.sessionId);
      void server?.close?.();
    };
    await connectTransport(transport, transport.sessionId);
  };

  const handleLegacyMessage = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');
    const transport = sessionId ? transports.get(sessionId) : null;
    if (!(transport instanceof SSEServerTransport)) {
      sendJson(res, {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'No SSE transport found for sessionId' },
        id: null
      }, 400);
      return;
    }
    const body = await readJson(req);
    await transport.handlePostMessage(req, res, body);
  };

  const handleStreamableHttp = async (req, res) => {
    const body = req.method === 'POST' ? await readJson(req) : undefined;
    const sessionId = req.headers['mcp-session-id'];
    let transport = sessionId ? transports.get(sessionId) : null;

    if (transport && !(transport instanceof StreamableHTTPServerTransport)) {
      sendJson(res, {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Session exists but uses a different transport protocol' },
        id: null
      }, 400);
      return;
    }

    if (!transport) {
      if (req.method !== 'POST' || !isInitializeRequest(body)) {
        sendJson(res, {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'No valid MCP session. Send initialize with POST /mcp first, or use SSE with GET /mcp.' },
          id: null
        }, 400);
        return;
      }

      let protocolServer;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: id => {
          transports.set(id, transport);
          if (protocolServer) servers.set(id, protocolServer);
        }
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (!id) return;
        transports.delete(id);
        const server = servers.get(id);
        servers.delete(id);
        void server?.close?.();
      };
      protocolServer = await connectTransport(transport);
    }

    await transport.handleRequest(req, res, body);
  };

  return async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/mcp/tools') {
        sendJson(res, { tools: listTools(tools) });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/mcp/docs') {
        sendHtml(res, createMcpDocsHtml(tools));
        return;
      }
      if ((url.pathname === '/sse' && req.method === 'GET') ||
          (url.pathname === '/mcp' && req.method === 'GET' && !req.headers['mcp-session-id'])) {
        await handleLegacySse(req, res);
        return;
      }
      if (url.pathname === SSE_MESSAGE_ENDPOINT && req.method === 'POST') {
        await handleLegacyMessage(req, res);
        return;
      }
      if (url.pathname === '/mcp' && ['GET', 'POST', 'DELETE'].includes(req.method)) {
        await handleStreamableHttp(req, res);
        return;
      }

      res.writeHead(404);
      res.end();
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error.message || 'Internal server error'
          },
          id: null
        }, 500);
      }
    }
  };
};
