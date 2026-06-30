import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import { writeFlacMetadata } from './flac.js';
import { writeMp3Metadata } from './id3.js';

export class MetadataService {
  constructor(logger = console) {
    this.logger = logger;
  }

  async embed({ filePath, meta = {}, lyricInfo = null, coverPath = null }) {
    try {
      await fs.access(filePath);
      const lyrics = this.lyricsText(lyricInfo);
      const payload = { filePath, meta, lyrics, coverPath };
      const ext = path.extname(filePath).toLowerCase();
      const result = ext === '.mp3'
        ? await writeMp3Metadata(payload)
        : ext === '.flac'
          ? await writeFlacMetadata(payload)
          : { format: ext.replace('.', '') || 'unknown', embedded: false, warnings: [`Unsupported metadata format: ${ext || '(none)'}`] };
      if (result.warnings?.length) this.logger.warn?.(`Metadata embed warning for ${filePath}: ${result.warnings.join('; ')}`);
      return {
        filePath,
        ...result,
        coverPath,
        lyricEmbedded: Boolean(lyrics)
      };
    } catch (error) {
      throw new AppError(ERROR_CODES.METADATA_EMBED_FAILED, error.message, { filePath }, 500);
    }
  }

  lyricsText(lyricInfo) {
    if (!lyricInfo) return '';
    if (typeof lyricInfo === 'string') return lyricInfo;
    return [
      lyricInfo.lyric,
      lyricInfo.tlyric,
      lyricInfo.rlyric,
      lyricInfo.lxlyric
    ].filter(Boolean).join('\n\n');
  }
}
