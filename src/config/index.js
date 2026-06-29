import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultConfig } from './defaults.js';
import { ensureDir, readJsonFile } from '../shared/fs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const merge = (base, override) => {
  const result = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = merge(result[key] || {}, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
};

const numberEnv = (name, fallback) => {
  if (!process.env[name]) return fallback;
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

const boolEnv = (name, fallback) => {
  if (process.env[name] == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(process.env[name].toLowerCase());
};

const envConfig = () => ({
  server: {
    host: process.env.MUSIC_HUB_HOST,
    port: numberEnv('MUSIC_HUB_PORT'),
    mcpHost: process.env.MUSIC_HUB_MCP_HOST,
    mcpPort: numberEnv('MUSIC_HUB_MCP_PORT')
  },
  paths: {
    dataDir: process.env.MUSIC_HUB_DATA_DIR,
    sourcesDir: process.env.MUSIC_HUB_SOURCES_DIR,
    downloadDir: process.env.MUSIC_HUB_DOWNLOAD_DIR,
    cacheDir: process.env.MUSIC_HUB_CACHE_DIR,
    logsDir: process.env.MUSIC_HUB_LOGS_DIR
  },
  sources: {
    multiSourceEnabled: boolEnv('MUSIC_HUB_SOURCES_MULTI_ENABLED')
  },
  download: {
    maxConcurrency: numberEnv('MUSIC_HUB_DOWNLOAD_CONCURRENCY'),
    resumeOnStartup: boolEnv('MUSIC_HUB_DOWNLOAD_RESUME_ON_STARTUP'),
    skipExistingFile: boolEnv('MUSIC_HUB_DOWNLOAD_SKIP_EXISTING'),
    quality: process.env.MUSIC_HUB_DOWNLOAD_QUALITY,
    qualityStrategy: process.env.MUSIC_HUB_DOWNLOAD_QUALITY_STRATEGY,
    sourceStrategy: process.env.MUSIC_HUB_DOWNLOAD_SOURCE_STRATEGY
  }
});

const pruneUndefined = value => {
  if (!value || typeof value !== 'object') return value;
  const result = Array.isArray(value) ? [] : {};
  for (const [key, child] of Object.entries(value)) {
    const pruned = pruneUndefined(child);
    if (pruned !== undefined) result[key] = pruned;
  }
  return Object.keys(result).length ? result : undefined;
};

const resolvePath = value => path.resolve(projectRoot, value);

export const loadConfig = async () => {
  const configPath = process.env.MUSIC_HUB_CONFIG
    ? path.resolve(process.env.MUSIC_HUB_CONFIG)
    : path.resolve(projectRoot, 'config.json');
  const fileConfig = await readJsonFile(configPath, {});
  const raw = merge(merge(defaultConfig, fileConfig), pruneUndefined(envConfig()) || {});

  const config = {
    ...raw,
    projectRoot,
    configPath,
    paths: {
      dataDir: resolvePath(raw.paths.dataDir),
      sourcesDir: resolvePath(raw.paths.sourcesDir),
      downloadDir: resolvePath(raw.paths.downloadDir),
      cacheDir: resolvePath(raw.paths.cacheDir),
      logsDir: resolvePath(raw.paths.logsDir)
    }
  };

  await Promise.all(Object.values(config.paths).map(ensureDir));
  return config;
};
