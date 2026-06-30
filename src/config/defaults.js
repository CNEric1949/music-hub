export const defaultConfig = {
  server: {
    host: '0.0.0.0',
    port: 3000,
    mcpHost: '0.0.0.0',
    mcpPort: 3100
  },
  paths: {
    dataDir: './data',
    sourcesDir: './data/sources',
    downloadDir: './data/downloads',
    cacheDir: './data/cache',
    logsDir: './data/logs'
  },
  sources: {
    multiSourceEnabled: true
  },
  download: {
    maxConcurrency: 3,
    resumeOnStartup: true,
    skipExistingFile: true,
    retryCount: 3,
    retryIntervalMs: 5000,
    quality: '320k',
    qualityStrategy: 'specified',
    sourceStrategy: 'specified',
    embedCover: true,
    saveCoverFile: true,
    embedLyric: false,
    saveLyricFile: false,
    mergeLyric: true,
    mergeTranslatedLyric: false,
    mergeRomanLyric: false,
    mergeLxLyric: true
  },
  http: {
    requestTimeoutMs: 15000
  },
  logging: {
    level: 'info',
    fileName: 'music-hub.log'
  }
};
