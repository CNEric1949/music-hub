import http from 'node:http';
import { createHttpHandler } from './router.js';

export const startHttpServer = app => new Promise(resolve => {
  const handler = createHttpHandler(app);
  const server = http.createServer(handler);
  server.listen(app.config.server.port, app.config.server.host, () => {
    console.log(`[HTTP] listening on http://${app.config.server.host}:${app.config.server.port}`);
    resolve(server);
  });
});
