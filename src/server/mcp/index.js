import http from 'node:http';
import { toErrorBody } from '../../shared/errors.js';
import { createTools, listTools } from './tools.js';

const readJson = async req => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const sendJson = (res, body) => {
  const data = JSON.stringify(body);
  res.writeHead(200, {
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

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, error) => ({
  jsonrpc: '2.0',
  id,
  error: {
    code: -32000,
    message: error.error?.message || 'Tool error',
    data: error.error || error
  }
});

export const startMcpServer = app => new Promise(resolve => {
  const tools = createTools(app);
  const server = http.createServer(createMcpHandler(tools));

  server.listen(app.config.server.mcpPort, app.config.server.mcpHost, () => {
    console.log(`[MCP] listening on http://${app.config.server.mcpHost}:${app.config.server.mcpPort}/mcp`);
    resolve(server);
  });
});

export const createMcpHandler = tools => async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/mcp/tools') {
      sendJson(res, { tools: listTools(tools) });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/mcp/docs') {
      sendHtml(res, createMcpDocsHtml(tools));
      return;
    }
    if (url.pathname !== '/mcp' || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const body = await readJson(req);
      if (body.method === 'tools/list') {
        sendJson(res, rpcResult(body.id, {
          tools: listTools(tools)
        }));
        return;
      }
      if (body.method === 'tools/call') {
        const tool = tools[body.params?.name];
        if (!tool) throw new Error(`Tool not found: ${body.params?.name}`);
        const result = await tool.handler(body.params?.arguments || {});
        sendJson(res, rpcResult(body.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result
        }));
        return;
      }
      sendJson(res, rpcResult(body.id, { server: 'music-hub', methods: ['tools/list', 'tools/call'] }));
    } catch (error) {
      sendJson(res, rpcError(null, toErrorBody(error)));
    }
  };
