#!/usr/bin/env node
import { createApp } from './app.js';
import { startHttpServer } from './server/http/index.js';
import { startMcpServer } from './server/mcp/index.js';

const mode = process.argv[2] || 'all';
const app = await createApp();

if (mode === 'http') {
  await startHttpServer(app);
} else if (mode === 'mcp') {
  await startMcpServer(app);
} else if (mode === 'all') {
  await Promise.all([
    startHttpServer(app),
    startMcpServer(app)
  ]);
} else {
  console.error(`Unknown mode: ${mode}`);
  process.exitCode = 1;
}
