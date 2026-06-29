import { loadConfig } from './config/index.js';
import { createLogger } from './shared/logger.js';
import { SourceManager } from './core/sources/manager.js';
import { SearchService } from './core/search/service.js';
import { MediaService } from './core/media/service.js';
import { MetadataService } from './core/metadata/service.js';
import { DownloadService } from './core/download/service.js';
import { ConfigService } from './core/config/service.js';

export const createApp = async (logger = console) => {
  const config = await loadConfig();
  if (logger === console) logger = await createLogger(config);
  logger.info?.(`music-hub starting, log file: ${logger.logPath || 'stdout'}`);
  const sourceManager = new SourceManager(config, logger);
  await sourceManager.init();

  const searchService = new SearchService(sourceManager);
  const mediaService = new MediaService(config, sourceManager, searchService);
  const metadataService = new MetadataService();
  const downloadService = new DownloadService(config, mediaService, searchService, metadataService, logger);
  await downloadService.init();
  const configService = new ConfigService(config);

  return {
    config,
    configService,
    sourceManager,
    searchService,
    mediaService,
    metadataService,
    downloadService
  };
};
