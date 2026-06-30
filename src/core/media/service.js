import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import { ensureDir, safeJoin } from '../../shared/fs.js';
import { sanitizeFileName } from '../../shared/text.js';
import { httpFetch } from '../../utils/request.js';

const qualityOrder = ['128k', '192k', '320k', 'flac', 'flac24bit', 'master'];

export class MediaService {
  constructor(config, sourceManager, searchService = null) {
    this.config = config;
    this.sourceManager = sourceManager;
    this.searchService = searchService;
  }

  getSourceForCapability(sourceId, capability) {
    const source = this.sourceManager.get(sourceId);
    if (!source.enabled) throw new AppError(ERROR_CODES.SOURCE_DISABLED, `Source disabled: ${sourceId}`, { source: sourceId }, 403);
    if (!source.capabilities?.includes(capability)) {
      throw new AppError(ERROR_CODES.SOURCE_CAPABILITY_UNSUPPORTED, `Source does not support capability: ${capability}`, { source: sourceId, capability }, 422);
    }
    return source;
  }

  async getLyric(songInfo) {
    const source = this.getProviderForCapability(songInfo.source, 'lyric');
    return source.getLyric(songInfo);
  }

  async saveLyric({ songInfo, lyricInfo, fileName, saveAll = true }) {
    const info = lyricInfo || await this.getLyric(songInfo);
    const merged = this.buildLyrics(info, this.config.download);
    const baseName = sanitizeFileName(fileName || `${songInfo.name || songInfo.songmid || 'lyric'} - ${songInfo.singer || 'unknown'}`);
    const lrcName = baseName.endsWith('.lrc') ? baseName : `${baseName}.lrc`;
    const filePath = safeJoin(this.config.paths.downloadDir, lrcName);
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, `\uFEFF${merged}`, 'utf8');

    const files = { lyric: filePath };
    if (saveAll && info.tlyric) files.translatedLyric = await this.writeLyricVariant(baseName, 'translated', info.tlyric);
    if (saveAll && info.rlyric) files.romanLyric = await this.writeLyricVariant(baseName, 'roman', info.rlyric);
    if (saveAll && info.lxlyric) files.lxLyric = await this.writeLyricVariant(baseName, 'lx', info.lxlyric);
    return { filePath, files };
  }

  async writeLyricVariant(baseName, suffix, content) {
    const cleanBase = sanitizeFileName(baseName.replace(/\.lrc$/i, ''));
    const filePath = safeJoin(this.config.paths.downloadDir, `${cleanBase}.${suffix}.lrc`);
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, `\uFEFF${content}`, 'utf8');
    return filePath;
  }

  buildLyrics(lyricInfo, options) {
    let lrc = lyricInfo.lyric || '';
    if (options.mergeTranslatedLyric && lyricInfo.tlyric) lrc = `${lrc.trim()}\n\n${lyricInfo.tlyric.trim()}\n`;
    if (options.mergeRomanLyric && lyricInfo.rlyric) lrc = `${lrc.trim()}\n\n${lyricInfo.rlyric.trim()}\n`;
    if (options.mergeLxLyric && lyricInfo.lxlyric) {
      const awlrc = [
        lyricInfo.lyric ? `lrc:${Buffer.from(lyricInfo.lyric.trim(), 'utf8').toString('base64')}` : null,
        lyricInfo.tlyric ? `tlrc:${Buffer.from(lyricInfo.tlyric.trim(), 'utf8').toString('base64')}` : null,
        lyricInfo.rlyric ? `rlrc:${Buffer.from(lyricInfo.rlyric.trim(), 'utf8').toString('base64')}` : null,
        lyricInfo.lxlyric ? `awlrc:${Buffer.from(lyricInfo.lxlyric.trim(), 'utf8').toString('base64')}` : null
      ].filter(Boolean).join(',');
      if (awlrc) lrc = `${lrc.trim()}\n\n[awlrc:${awlrc}]\n`;
    }
    return lrc;
  }

  async getCover(songInfo) {
    const source = this.getProviderForCapability(songInfo.source, 'cover');
    const result = await source.getCover(songInfo);
    return typeof result === 'string' ? { url: result } : result;
  }

  async downloadCover({ songInfo, url, fileName }) {
    const cover = url ? { url } : await this.getCover(songInfo);
    const coverUrl = cover.url;
    if (!coverUrl) throw new AppError(ERROR_CODES.MUSIC_NOT_FOUND, 'Cover URL not found', { songInfo }, 404);
    const response = await httpFetch(coverUrl, { responseType: 'buffer' });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, `Cover download failed: HTTP ${response.statusCode}`, { url: coverUrl }, 502);
    }
    const ext = this.coverExtFromContentType(response.headers?.['content-type']) || this.coverExtFromUrl(coverUrl);
    const name = sanitizeFileName(fileName || `${songInfo.name || songInfo.songmid || 'cover'} - ${songInfo.singer || 'unknown'}.${ext}`);
    const filePath = safeJoin(this.config.paths.downloadDir, name);
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, response.body);
    return { ...cover, filePath, url: coverUrl };
  }

  coverExtFromContentType(contentType = '') {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    return '';
  }

  coverExtFromUrl(rawUrl) {
    try {
      const ext = path.extname(new URL(rawUrl).pathname).replace('.', '').toLowerCase();
      return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
    } catch {
      return 'jpg';
    }
  }

  async getAlbumDetail(payload) {
    const source = this.getProviderForCapability(payload.source || payload.songInfo?.source, 'album');
    return source.getAlbumDetail(payload);
  }

  async getSingerDetail(payload) {
    const source = this.getProviderForCapability(payload.source || payload.songInfo?.source, 'singer');
    return source.getSingerDetail(payload);
  }

  async getMusicDetail(payload) {
    const source = this.getProviderForCapability(payload.source || payload.songInfo?.source, 'detail');
    return source.getMusicDetail(payload);
  }

  getProviderForCapability(songSource, capability) {
    const direct = this.sourceManager.sources.get(songSource);
    if (direct?.enabled && direct.capabilities?.includes(capability) && direct.type === 'custom') return direct;
    const custom = Array.from(this.sourceManager.sources.values()).find(candidate =>
      candidate.type === 'custom' &&
      candidate.enabled &&
      candidate.initialized &&
      candidate.capabilities?.includes(capability) &&
      (!candidate.lxSources?.length || candidate.lxSources.includes(songSource))
    );
    if (custom) return custom;
    return this.getSourceForCapability(songSource, capability);
  }

  withSource(songInfo, sourceId) {
    return sourceId ? { ...songInfo, source: sourceId } : songInfo;
  }

  getUrlProviders(songSource, providerId = null) {
    if (providerId) {
      const provider = this.getSourceForCapability(providerId, 'url');
      if (provider.lxSources?.length && !provider.lxSources.includes(songSource)) {
        throw new AppError(ERROR_CODES.SOURCE_CAPABILITY_UNSUPPORTED, `Source does not support platform: ${songSource}`, { source: providerId, platform: songSource }, 422);
      }
      return [provider];
    }
    const direct = this.sourceManager.sources.get(songSource);
    const providers = [];
    if (direct?.enabled && direct.capabilities?.includes('url')) providers.push(direct);
    providers.push(...Array.from(this.sourceManager.sources.values()).filter(candidate =>
        candidate.type === 'custom' &&
        candidate.enabled &&
        candidate.initialized &&
        candidate.capabilities?.includes('url') &&
        candidate.id !== direct?.id &&
        (!candidate.lxSources?.length || candidate.lxSources.includes(songSource))
      ));
    if (!providers.length) providers.push(this.getSourceForCapability(songSource, 'url'));
    return providers;
  }

  async getMusicUrl(songInfo, quality, sourceId = null, providerId = null) {
    const targetSong = this.withSource(songInfo, sourceId);
    if (quality) this.getQualities(targetSong, quality);
    const failures = [];
    for (const provider of this.getUrlProviders(targetSong.source, providerId)) {
      try {
        const result = await provider.getMusicUrl(targetSong, quality);
        const normalized = typeof result === 'string'
          ? { url: result, type: quality, provider: provider.id }
          : { ...result, provider: result.provider || provider.id };
        if (normalized?.url) return normalized;
        failures.push(this.failure(provider.id, targetSong.source, quality, ERROR_CODES.MUSIC_NOT_FOUND, 'Music URL not found'));
      } catch (error) {
        failures.push(this.failure(provider.id, targetSong.source, quality, error.code || ERROR_CODES.INTERNAL_ERROR, error.message));
      }
    }
    throw new AppError(ERROR_CODES.MUSIC_NOT_FOUND, 'Music URL not found', { failures }, 404);
  }

  async resolveMusicUrl({ songInfo, quality, type, source, platform, provider, providerId, allQualities = null, allSources = null }) {
    if (!songInfo) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'songInfo is required', {}, 400);
    const targetQuality = quality || type;
    const sourceId = source || platform || null;
    const targetProvider = provider || providerId || null;
    const shouldAllSources = allSources ?? !sourceId;
    const shouldAllQualities = allQualities ?? !targetQuality;
    if (!shouldAllSources && !shouldAllQualities) return this.getMusicUrl(songInfo, targetQuality, sourceId, targetProvider);

    const songs = shouldAllSources ? await this.getUrlCandidates(songInfo, sourceId) : [this.withSource(songInfo, sourceId)];
    const results = [];
    const failures = [];
    for (const item of songs) {
      const sourceKey = item.source || sourceId || songInfo.source;
      const resolved = await this.getMusicUrlsForSong(item, shouldAllQualities ? null : targetQuality, targetProvider);
      results.push({ source: sourceKey, urls: resolved.urls });
      failures.push(...resolved.failures);
    }
    return { results, failures };
  }

  async getUrlCandidates(songInfo, sourceId = null) {
    if (sourceId) return [this.withSource(songInfo, sourceId)];
    const candidates = [songInfo];
    if (this.searchService) {
      const matched = await this.searchService.match({
        name: songInfo.name,
        singer: songInfo.singer,
        albumName: songInfo.albumName,
        interval: songInfo.interval,
        source: songInfo.source
      });
      candidates.push(...matched.list);
    }
    const seen = new Set();
    return candidates.filter(item => {
      if (!item?.source || seen.has(item.source)) return false;
      seen.add(item.source);
      return true;
    });
  }

  async getMusicUrlsForSong(songInfo, quality = null, providerId = null) {
    const qualities = this.getQualities(songInfo, quality);
    const urls = {};
    const failures = [];
    for (const itemQuality of qualities) {
      try {
        urls[itemQuality] = await this.getMusicUrl(songInfo, itemQuality, null, providerId);
      } catch (error) {
        failures.push(...(error.details?.failures || [this.failure(providerId || '', songInfo.source, itemQuality, error.code || ERROR_CODES.INTERNAL_ERROR, error.message)]));
      }
    }
    return { urls, failures };
  }

  getQualities(songInfo, quality = null) {
    const songQualities = songInfo.types?.map(item => item.type).filter(Boolean) || [];
    const available = songQualities.length
      ? songQualities
      : this.sourceManager.get(songInfo.source).supportedQualities
      || [];
    if (quality) {
      if (available.length && !available.includes(quality)) {
        throw new AppError(ERROR_CODES.QUALITY_UNSUPPORTED, `Quality unsupported: ${quality}`, { source: songInfo.source, quality, availableQualities: available }, 422);
      }
      return [quality];
    }
    return [...new Set(available)].sort((a, b) => this.qualityRank(a) - this.qualityRank(b));
  }

  qualityRank(quality) {
    const index = qualityOrder.indexOf(quality);
    return index === -1 ? qualityOrder.length : index;
  }

  failure(provider, source, quality, code, message) {
    return { provider, source, quality, code, message };
  }
}
