#!/usr/bin/env node
import { createApp } from './app.js';
import { startHttpServer } from './server/http/index.js';
import { startMcpServer, startStdioMcpServer } from './server/mcp/index.js';

const mode = process.argv[2] || 'all';
const createStdioLogger = () => {
  const write = (level, args) => console.error(`[${level}]`, ...args);
  return {
    debug: (...args) => write('debug', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args)
  };
};

const app = await createApp(mode === 'stdio' ? createStdioLogger() : console);

if (mode === 'http') {
  await startHttpServer(app);
} else if (mode === 'mcp') {
  await startMcpServer(app);
} else if (mode === 'stdio') {
  await startStdioMcpServer(app);
} else if (mode === 'all') {
  await Promise.all([
    startHttpServer(app),
    startMcpServer(app)
  ]);
} else {
  console.error(`Unknown mode: ${mode}`);
  process.exitCode = 1;
}
