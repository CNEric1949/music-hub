import fs from 'node:fs/promises';
import { AppError, ERROR_CODES } from '../../shared/errors.js';

export class MetadataService {
  async embed({ filePath, meta = {}, lyricInfo = null, coverPath = null }) {
    try {
      const sidecarPath = `${filePath}.music-hub-meta.json`;
      await fs.writeFile(sidecarPath, JSON.stringify({
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        lyricInfo,
        coverPath,
        embeddedAt: new Date().toISOString()
      }, null, 2), 'utf8');
      return { filePath, sidecarPath };
    } catch (error) {
      throw new AppError(ERROR_CODES.METADATA_EMBED_FAILED, error.message, { filePath }, 500);
    }
  }
}
