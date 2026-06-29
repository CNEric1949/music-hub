import { AppError, ERROR_CODES, toErrorBody } from '../../shared/errors.js';
import { ok } from '../../shared/response.js';
import { apiDocsHtml, openApiDocument } from './openapi.js';

const readJson = async req => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid JSON body', {}, 400);
  }
};

const sendJson = (res, status, body) => {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(data);
};

const sendHtml = (res, status, html) => {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html)
  });
  res.end(html);
};

const match = (method, pathname, pattern) => {
  const parts = pathname.split('/').filter(Boolean);
  const expected = pattern.path.split('/').filter(Boolean);
  if (method !== pattern.method || parts.length !== expected.length) return null;
  const params = {};
  for (let i = 0; i < expected.length; i++) {
    if (expected[i].startsWith(':')) params[expected[i].slice(1)] = decodeURIComponent(parts[i]);
    else if (expected[i] !== parts[i]) return null;
  }
  return params;
};

export const createHttpHandler = app => {
  const routes = [
    { method: 'GET', path: '/health', handler: async () => ({ status: 'ok' }) },
    { method: 'GET', path: '/sources', handler: async () => app.sourceManager.list() },
    { method: 'POST', path: '/sources', handler: async ({ body }) => app.sourceManager.create(body) },
    { method: 'GET', path: '/sources/:id', handler: async ({ params }) => app.sourceManager.getPublic(params.id) },
    { method: 'PATCH', path: '/sources/:id', handler: async ({ params, body }) => app.sourceManager.update(params.id, body) },
    { method: 'DELETE', path: '/sources/:id', handler: async ({ params }) => app.sourceManager.delete(params.id) },
    { method: 'POST', path: '/sources/reload', handler: async ({ body }) => app.sourceManager.reload(body.id) },
    { method: 'POST', path: '/sources/:id/enable', handler: async ({ params }) => app.sourceManager.enable(params.id, true) },
    { method: 'POST', path: '/sources/:id/disable', handler: async ({ params }) => app.sourceManager.enable(params.id, false) },
    { method: 'POST', path: '/sources/:id/check-update', handler: async ({ params }) => app.sourceManager.checkUpdate(params.id) },
    { method: 'POST', path: '/music/search', handler: async ({ body }) => app.searchService.search(body) },
    { method: 'POST', path: '/music/match', handler: async ({ body }) => app.searchService.match(body) },
    { method: 'POST', path: '/music/url', handler: async ({ body }) => app.mediaService.resolveMusicUrl(body) },
    { method: 'POST', path: '/music/urls', handler: async ({ body }) => app.mediaService.resolveMusicUrl({ ...body, allQualities: true }) },
    { method: 'POST', path: '/albums/detail', handler: async ({ body }) => app.mediaService.getAlbumDetail(body) },
    { method: 'POST', path: '/singers/detail', handler: async ({ body }) => app.mediaService.getSingerDetail(body) },
    { method: 'POST', path: '/music/detail', handler: async ({ body }) => app.mediaService.getMusicDetail(body) },
    { method: 'POST', path: '/lyrics/get', handler: async ({ body }) => app.mediaService.getLyric(body.songInfo || body) },
    { method: 'POST', path: '/lyrics/save', handler: async ({ body }) => app.mediaService.saveLyric(body) },
    { method: 'POST', path: '/covers/get', handler: async ({ body }) => app.mediaService.getCover(body.songInfo || body) },
    { method: 'POST', path: '/covers/download', handler: async ({ body }) => app.mediaService.downloadCover(body) },
    { method: 'POST', path: '/downloads', handler: async ({ body }) => app.downloadService.create(body) },
    { method: 'GET', path: '/downloads', handler: async () => app.downloadService.list() },
    { method: 'GET', path: '/downloads/:id', handler: async ({ params }) => app.downloadService.get(params.id) },
    { method: 'POST', path: '/downloads/:id/pause', handler: async ({ params }) => app.downloadService.pause(params.id) },
    { method: 'POST', path: '/downloads/:id/resume', handler: async ({ params }) => app.downloadService.resume(params.id) },
    { method: 'POST', path: '/downloads/:id/cancel', handler: async ({ params }) => app.downloadService.cancel(params.id) },
    { method: 'POST', path: '/downloads/:id/retry', handler: async ({ params }) => app.downloadService.retry(params.id) },
    { method: 'POST', path: '/metadata/embed', handler: async ({ body }) => app.metadataService.embed(body) }
  ];

  return async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/api-docs') {
        sendHtml(res, 200, apiDocsHtml);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/openapi.json') {
        sendJson(res, 200, openApiDocument);
        return;
      }
      const route = routes.map(pattern => ({ pattern, params: match(req.method, url.pathname, pattern) }))
        .find(item => item.params);
      if (!route) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Route not found', { path: url.pathname }, 404);
      const body = ['POST', 'PATCH', 'DELETE'].includes(req.method) ? await readJson(req) : {};
      const data = await route.pattern.handler({ params: route.params, body, query: Object.fromEntries(url.searchParams) });
      sendJson(res, 200, ok(data));
    } catch (error) {
      sendJson(res, error.status || 500, toErrorBody(error));
    }
  };
};
