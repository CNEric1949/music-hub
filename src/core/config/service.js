import { AppError, ERROR_CODES } from '../../shared/errors.js';

const qualities = new Set(['128k', '192k', '320k', 'flac', 'flac24bit', 'master']);
const qualityStrategies = new Set(['specified', 'highest', 'lowest']);
const sourceStrategies = new Set(['specified', 'all']);

export class ConfigService {
  constructor(config) {
    this.config = config;
  }

  getPublic() {
    return {
      server: this.config.server,
      paths: this.config.paths,
      sources: this.config.sources,
      download: this.config.download,
      http: this.config.http,
      logging: this.config.logging
    };
  }

  update(patch = {}) {
    if (patch.sources) {
      if (patch.sources.multiSourceEnabled != null) this.config.sources.multiSourceEnabled = Boolean(patch.sources.multiSourceEnabled);
    }
    if (patch.download) this.updateDownload(patch.download);
    return this.getPublic();
  }

  updateDownload(patch) {
    if (patch.quality != null) {
      if (!qualities.has(patch.quality)) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, `Unsupported download quality: ${patch.quality}`, { quality: patch.quality }, 400);
      }
      this.config.download.quality = patch.quality;
    }
    if (patch.qualityStrategy != null) {
      if (!qualityStrategies.has(patch.qualityStrategy)) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, `Unsupported quality strategy: ${patch.qualityStrategy}`, { qualityStrategy: patch.qualityStrategy }, 400);
      }
      this.config.download.qualityStrategy = patch.qualityStrategy;
    }
    if (patch.sourceStrategy != null) {
      if (!sourceStrategies.has(patch.sourceStrategy)) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, `Unsupported source strategy: ${patch.sourceStrategy}`, { sourceStrategy: patch.sourceStrategy }, 400);
      }
      this.config.download.sourceStrategy = patch.sourceStrategy;
    }
    const copyKeys = [
      'maxConcurrency',
      'resumeOnStartup',
      'skipExistingFile',
      'embedCover',
      'saveCoverFile',
      'embedLyric',
      'saveLyricFile',
      'mergeLyric',
      'mergeTranslatedLyric',
      'mergeRomanLyric',
      'mergeLxLyric'
    ];
    for (const key of copyKeys) {
      if (patch[key] !== undefined) this.config.download[key] = patch[key];
    }
  }
}
