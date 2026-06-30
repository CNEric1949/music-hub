import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fss from 'node:fs';
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

export const withRealSourceEnv = async (fn, { files = realSourceFiles, root = tempRoot, multiSourceEnabled = true } = {}) => {
  const old = { ...process.env };
  process.env.MUSIC_HUB_DATA_DIR = path.join(root, 'data');
  process.env.MUSIC_HUB_SOURCES_DIR = path.join(root, 'sources');
  process.env.MUSIC_HUB_DOWNLOAD_DIR = path.join(root, 'downloads');
  process.env.MUSIC_HUB_CACHE_DIR = path.join(root, 'cache');
  process.env.MUSIC_HUB_LOGS_DIR = path.join(root, 'logs');
  process.env.MUSIC_HUB_SOURCES_MULTI_ENABLED = multiSourceEnabled ? 'true' : 'false';
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

export const invokeHttp = async (handler, method, url, body) => {
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
  req.headers = { host: 'localhost', 'content-type': 'application/json' };

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

export const invokeMcp = async (handler, payload) => {
  const response = await invokeHttp(handler, 'POST', '/mcp', payload);
  assert.equal(response.statusCode, 200);
  return response.body;
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
