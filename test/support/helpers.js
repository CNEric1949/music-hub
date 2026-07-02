import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { createApp } from '../../src/app.js';
import { createHttpHandler } from '../../src/server/http/router.js';
import { createMcpHandler } from '../../src/server/mcp/index.js';
import { createTools } from '../../src/server/mcp/tools.js';

export const tempRoot = path.resolve('/tmp/music-hub-test');
export const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname);
export const sourceRoot = path.join(projectRoot, 'data/sources');
export const keyword = '紅蓮華';
export const builtinPlatforms = ['kw', 'kg', 'tx', 'wy', 'mg'];

export const realSourceFiles = fss.existsSync(sourceRoot)
  ? fss.readdirSync(sourceRoot).filter(file => file.endsWith('.js')).sort()
  : [];

export const getRealSource = predicate => {
  const fileName = realSourceFiles.find(predicate) || realSourceFiles[0] || '';
  return {
    fileName,
    id: fileName ? path.basename(fileName, '.js') : '',
    path: fileName ? path.join(sourceRoot, fileName) : '',
    code: fileName ? fss.readFileSync(path.join(sourceRoot, fileName), 'utf8') : ''
  };
};

export const withRealSourceEnv = async (fn, { files = realSourceFiles, root = tempRoot, multiSourceEnabled = true, env = {} } = {}) => {
  const old = { ...process.env };
  process.env.MUSIC_HUB_DATA_DIR = path.join(root, 'data');
  process.env.MUSIC_HUB_SOURCES_DIR = path.join(root, 'sources');
  process.env.MUSIC_HUB_DOWNLOAD_DIR = path.join(root, 'downloads');
  process.env.MUSIC_HUB_CACHE_DIR = path.join(root, 'cache');
  process.env.MUSIC_HUB_LOGS_DIR = path.join(root, 'logs');
  process.env.MUSIC_HUB_SOURCES_MULTI_ENABLED = multiSourceEnabled ? 'true' : 'false';
  Object.assign(process.env, env);
  try {
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(path.join(root, 'sources'), { recursive: true });
    for (const file of files) await fs.copyFile(path.join(sourceRoot, file), path.join(root, 'sources', file));
    await fn(root);
  } finally {
    process.env = old;
  }
};

export const createTestHandlers = async () => {
  const app = await createApp();
  return {
    app,
    httpHandler: createHttpHandler(app),
    mcpHandler: createMcpHandler(createTools(app))
  };
};

export const invokeHttp = async (handler, method, url, body, headers = {}) => {
  const chunks = [];
  const req = new Readable({
    read() {
      if (body == null) this.push(null);
      else {
        this.push(Buffer.from(JSON.stringify(body)));
        this.push(null);
      }
    }
  });
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost', 'content-type': 'application/json', ...headers };

  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  res.writeHead = (statusCode, headers = {}) => {
    res.statusCode = statusCode;
    res.headers = headers;
    return res;
  };
  res.end = chunk => {
    if (chunk) chunks.push(Buffer.from(chunk));
    Writable.prototype.end.call(res);
  };

  await handler(req, res);
  const text = Buffer.concat(chunks).toString('utf8');
  const contentType = res.headers?.['Content-Type'] || res.headers?.['content-type'] || '';
  const parsedBody = text && contentType.includes('application/json') ? JSON.parse(text) : text || null;
  return { statusCode: res.statusCode, headers: res.headers, body: parsedBody };
};

const mcpSessions = new WeakMap();

const listenOnLoopback = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    server.off('error', reject);
    server.unref();
    resolve();
  });
});

const readFetchJson = async response => {
  const text = await response.text();
  if (text.startsWith('event:')) {
    const data = text
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trimStart())
      .join('\n');
    return data ? JSON.parse(data) : null;
  }
  return text ? JSON.parse(text) : null;
};

const mcpHeaders = sessionId => ({
  Accept: 'application/json, text/event-stream',
  'Content-Type': 'application/json',
  ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {})
});

const getMcpSession = async handler => {
  const existing = mcpSessions.get(handler);
  if (existing) return existing;

  const server = http.createServer(handler);
  await listenOnLoopback(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const initResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: mcpHeaders(),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'init',
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'music-hub-test', version: '0.0.0' }
      }
    })
  });
  assert.equal(initResponse.status, 200);
  const sessionId = initResponse.headers.get('mcp-session-id');
  assert.ok(sessionId, 'MCP initialize response should include mcp-session-id');
  await readFetchJson(initResponse);

  const initializedResponse = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: mcpHeaders(sessionId),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    })
  });
  assert.ok([200, 202].includes(initializedResponse.status));
  await initializedResponse.text();

  const session = { baseUrl, sessionId, server };
  mcpSessions.set(handler, session);
  return session;
};

export const invokeMcp = async (handler, payload) => {
  const session = await getMcpSession(handler);
  const response = await fetch(`${session.baseUrl}/mcp`, {
    method: 'POST',
    headers: mcpHeaders(session.sessionId),
    body: JSON.stringify(payload)
  });
  const body = await readFetchJson(response);
  assert.equal(response.status, 200);
  return body;
};

export const fspExists = async target => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

export const qualitiesText = qualities => qualities?.length ? qualities.join(', ') : '(未声明)';
