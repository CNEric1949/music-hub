import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from './fs.js';

const levels = ['debug', 'info', 'warn', 'error'];

const formatArg = arg => {
  if (arg instanceof Error) return `${arg.stack || arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};

export const createLogger = async config => {
  await ensureDir(config.paths.logsDir);
  const logPath = path.join(config.paths.logsDir, config.logging.fileName);
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  const minIndex = levels.indexOf(config.logging.level || 'info');

  const write = (level, args) => {
    if (levels.indexOf(level) < minIndex) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${args.map(formatArg).join(' ')}\n`;
    stream.write(line);
    const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    target(line.trimEnd());
  };

  return {
    logPath,
    debug: (...args) => write('debug', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args)
  };
};
