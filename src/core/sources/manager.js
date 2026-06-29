import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import { ensureDir, readJsonFile, safeJoin, writeJsonFile } from '../../shared/fs.js';
import { sanitizeFileName } from '../../shared/text.js';
import { httpFetch } from '../../utils/request.js';
import { createBuiltinSources } from './builtin.js';
import { loadCustomSourceScript } from './custom-runtime.js';

const SOURCE_FILE = 'sources.json';
const SOURCE_FILE_EXTENSION = '.js';
const DEFAULT_SOURCE_QUALITIES = ['128k', '192k', '320k', 'flac', 'flac24bit'];

const toPublicSource = source => ({
  id: source.id,
  name: source.name || source.id,
  type: source.type,
  enabled: source.enabled,
  initialized: source.initialized,
  version: source.version,
  updateUrl: source.updateUrl,
  supportedQualities: source.supportedQualities || [],
  capabilities: source.capabilities || [],
  platforms: source.platforms || source.lxSources || [],
  platformQualities: source.platformQualities || {},
  status: source.status || 'ok',
  error: source.error || null,
  initMessage: source.initMessage || '',
  update: source.update || {
    available: false,
    message: '',
    info: null,
    checkedAt: null
  }
});

export class SourceManager {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.registryPath = path.join(config.paths.dataDir, SOURCE_FILE);
    this.sources = new Map();
    this.customRecords = [];
  }

  async init() {
    await ensureDir(this.config.paths.sourcesDir);
    for (const source of createBuiltinSources()) this.sources.set(source.id, source);
    this.customRecords = await readJsonFile(this.registryPath, []);
    await this.discoverSourceFiles();
    if (this.config.sources.multiSourceEnabled) {
      await Promise.all(this.customRecords.map(record => this.loadCustomSource(record)));
    } else {
      const firstEnabled = this.customRecords.find(record => !record.deletedAt && record.enabled);
      for (const record of this.customRecords) {
        if (record === firstEnabled) await this.loadCustomSource(record);
        else await this.markInactive(record, 'multiSourceEnabled=false');
      }
    }
  }

  list() {
    return Array.from(this.sources.values()).map(toPublicSource);
  }

  get(id) {
    const source = this.sources.get(id);
    if (!source) {
      throw new AppError(ERROR_CODES.SOURCE_NOT_FOUND, `Source not found: ${id}`, { id }, 404);
    }
    return source;
  }

  getPublic(id) {
    return toPublicSource(this.get(id));
  }

  async saveRegistry() {
    await writeJsonFile(this.registryPath, this.customRecords);
  }

  async discoverSourceFiles() {
    const files = await fs.readdir(this.config.paths.sourcesDir).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    let changed = false;
    const now = new Date().toISOString();
    const existingFileNames = new Set(this.customRecords.map(record => record.fileName).filter(Boolean));
    for (const fileName of files) {
      if (!fileName.endsWith(SOURCE_FILE_EXTENSION)) continue;
      if (fileName.startsWith('.')) continue;
      if (existingFileNames.has(fileName)) continue;
      const id = path.basename(fileName, SOURCE_FILE_EXTENSION);
      if (this.customRecords.some(record => record.id === id)) continue;
      const record = {
        id,
        name: id,
        type: 'custom',
        enabled: true,
        version: '0.0.0',
        updateUrl: null,
        fileName,
        discovered: true,
        createdAt: now,
        updatedAt: now
      };
      this.customRecords.push(record);
      existingFileNames.add(fileName);
      changed = true;
      this.logger.info?.(`discovered custom source file: ${fileName}`);
    }
    if (changed) await this.saveRegistry();
  }

  normalizeSourceFileName(id, fileName) {
    const clean = sanitizeFileName(fileName || `${id}.js`);
    return clean.endsWith(SOURCE_FILE_EXTENSION) ? clean : `${clean}${SOURCE_FILE_EXTENSION}`;
  }

  async create(record) {
    const code = await this.resolveSourceCode(record);
    const id = record?.id || this.idFromRecord(record, code);
    if (!id) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Source id is required', {}, 400);
    if (this.sources.has(id) || this.customRecords.some(item => item.id === id)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, `Source already exists: ${id}`, { id }, 409);
    }
    const next = {
      id,
      name: record.name || null,
      type: 'custom',
      enabled: record.enabled ?? true,
      version: record.version || '0.0.0',
      updateUrl: record.updateUrl || null,
      fileName: this.normalizeSourceFileName(id, record.fileName),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await fs.writeFile(safeJoin(this.config.paths.sourcesDir, next.fileName), code, 'utf8');
    this.customRecords.push(next);
    await this.saveRegistry();
    await this.loadCustomSource(next);
    return this.getPublic(next.id);
  }

  async resolveSourceCode(record = {}) {
    if (record.code) return String(record.code);
    if (record.filePath) return fs.readFile(path.resolve(record.filePath), 'utf8');
    if (record.url) {
      const response = await httpFetch(record.url);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, `Source download failed: HTTP ${response.statusCode}`, { url: record.url }, 400);
      }
      return Buffer.isBuffer(response.body) ? response.body.toString('utf8') : String(response.body);
    }
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'code, filePath, or url is required', {}, 400);
  }

  idFromRecord(record = {}, code = '') {
    if (record.id) return record.id;
    if (record.fileName) return path.basename(record.fileName, SOURCE_FILE_EXTENSION);
    if (record.filePath) return path.basename(record.filePath, SOURCE_FILE_EXTENSION);
    if (record.url) {
      try {
        return path.basename(new URL(record.url).pathname, SOURCE_FILE_EXTENSION) || null;
      } catch {
        return null;
      }
    }
    return code.match(/@name\s+([^\n\r]+)/)?.[1]?.trim() || null;
  }

  async update(id, patch) {
    const record = this.customRecords.find(item => item.id === id);
    if (!record) {
      throw new AppError(ERROR_CODES.SOURCE_NOT_FOUND, `Custom source not found: ${id}`, { id }, 404);
    }
    const { code: inlineCode, filePath, url, ...recordPatch } = patch;
    Object.assign(record, {
      ...recordPatch,
      id,
      type: 'custom',
      updatedAt: new Date().toISOString()
    });
    if (inlineCode || filePath || url) {
      const code = await this.resolveSourceCode({ code: inlineCode, filePath, url });
      await fs.writeFile(safeJoin(this.config.paths.sourcesDir, record.fileName || `${id}.js`), code, 'utf8');
    }
    await this.saveRegistry();
    await this.loadCustomSource(record);
    return this.getPublic(id);
  }

  async delete(id) {
    const index = this.customRecords.findIndex(item => item.id === id);
    const record = this.customRecords[index];
    if (!record) {
      throw new AppError(ERROR_CODES.SOURCE_NOT_FOUND, `Custom source not found: ${id}`, { id }, 404);
    }
    this.sources.delete(id);
    this.customRecords.splice(index, 1);
    if (record.fileName) await fs.rm(safeJoin(this.config.paths.sourcesDir, record.fileName), { force: true });
    await this.saveRegistry();
    return { id, deleted: true };
  }

  async enable(id, enabled) {
    const record = this.customRecords.find(item => item.id === id);
    if (!record) throw new AppError(ERROR_CODES.SOURCE_NOT_FOUND, `Custom source not found: ${id}`, { id }, 404);
    record.enabled = enabled;
    record.updatedAt = new Date().toISOString();
    await this.saveRegistry();
    await this.loadCustomSource(record);
    return this.getPublic(id);
  }

  async reload(id) {
    if (id) {
      const record = this.customRecords.find(item => item.id === id);
      if (!record) throw new AppError(ERROR_CODES.SOURCE_NOT_FOUND, `Custom source not found: ${id}`, { id }, 404);
      await this.loadCustomSource(record);
      return this.getPublic(id);
    }
    this.sources.clear();
    for (const source of createBuiltinSources()) this.sources.set(source.id, source);
    await this.discoverSourceFiles();
    if (this.config.sources.multiSourceEnabled) await Promise.all(this.customRecords.map(record => this.loadCustomSource(record)));
    else {
      const firstEnabled = this.customRecords.find(record => !record.deletedAt && record.enabled);
      for (const record of this.customRecords) {
        if (record === firstEnabled) await this.loadCustomSource(record);
        else await this.markInactive(record, 'multiSourceEnabled=false');
      }
    }
    return this.list();
  }

  async checkUpdate(id) {
    const source = this.getPublic(id);
    return {
      id,
      updateUrl: source.updateUrl || source.update?.info?.updateUrl || null,
      ...source.update
    };
  }

  async markInactive(record, message) {
    this.sources.set(record.id, {
      ...record,
      type: 'custom',
      initialized: false,
      status: 'inactive',
      initMessage: message,
      capabilities: [],
      supportedQualities: [],
      update: this.publicUpdateInfo(record)
    });
  }

  publicUpdateInfo(record, source = {}) {
    const info = source.updateInfo || record.updateInfo || null;
    return {
      available: Boolean(info),
      message: info?.message || info?.log || '',
      info,
      checkedAt: info ? (record.updateCheckedAt || new Date().toISOString()) : null
    };
  }

  async loadCustomSource(record) {
    if (record.deletedAt || !record.enabled) {
      this.sources.set(record.id, {
        ...record,
        type: 'custom',
        initialized: false,
        capabilities: [],
        supportedQualities: [],
        update: this.publicUpdateInfo(record)
      });
      return;
    }
    const fileName = record.fileName || `${record.id}.js`;
    const filePath = safeJoin(this.config.paths.sourcesDir, fileName);
    try {
      const code = await fs.readFile(filePath, 'utf8');
      const api = await loadCustomSourceScript({
        code,
        fileName,
        logger: this.logger,
        onUpdateAlert: (alert, scriptInfo) => {
          const updateInfo = this.normalizeUpdateInfo(alert, scriptInfo);
          record.updateInfo = updateInfo;
          record.updateCheckedAt = new Date().toISOString();
          const source = this.sources.get(record.id);
          if (source) source.update = this.publicUpdateInfo(record);
        }
      });
      const updateInfo = this.normalizeUpdateInfo(api.__updateAlerts?.at?.(-1), api.__scriptInfo);
      record.updateInfo = updateInfo;
      record.updateCheckedAt = updateInfo ? new Date().toISOString() : null;
      if (api.__scriptInfo?.updateUrl) record.updateUrl = record.updateUrl || api.__scriptInfo.updateUrl;
      const source = this.wrapCustomApi(record, api || {});
      this.sources.set(record.id, source);
      record.status = 'ok';
      record.error = null;
      record.version = source.version;
      record.name = source.name;
      record.updatedAt = new Date().toISOString();
      await this.saveRegistry();
      this.logger.info?.(`custom source loaded: ${record.id} (${fileName})`);
    } catch (error) {
      record.status = 'script_error';
      record.error = error.message;
      await this.saveRegistry();
      this.sources.set(record.id, {
        ...record,
        type: 'custom',
        enabled: record.enabled,
        initialized: false,
        status: 'script_error',
        error: error.message,
        capabilities: [],
        supportedQualities: [],
        update: this.publicUpdateInfo(record)
      });
      this.logger.error?.(`custom source load failed: ${record.id} (${fileName})`, error);
    }
  }

  normalizeUpdateInfo(alert, scriptInfo = {}) {
    if (!alert) return null;
    return {
      available: true,
      version: alert.version || alert.latestVersion || alert.ver || '',
      currentVersion: scriptInfo.version || '',
      updateUrl: alert.updateUrl || alert.url || scriptInfo.updateUrl || '',
      message: alert.log || alert.message || '',
      confirmText: alert.confirmText || '',
      cancelText: alert.cancelText || '',
      raw: alert
    };
  }

  normalizeSearchResult(result, fallback = {}) {
    const payload = Array.isArray(result) ? { list: result } : (result || {});
    const list = payload.list || payload.data || payload.musicList || payload.songs || [];
    const limit = Number(payload.limit || fallback.limit || list.length || 0);
    return {
      list,
      allPage: Number(payload.allPage || payload.pageCount || payload.totalPage || 0),
      total: Number(payload.total || payload.count || list.length || 0),
      limit,
      source: payload.source || fallback.source
    };
  }

  normalizeLyricResult(result) {
    if (typeof result === 'string') return { lyric: result, tlyric: '', rlyric: '', lxlyric: '' };
    return {
      lyric: result?.lyric || result?.lrc || '',
      tlyric: result?.tlyric || result?.tlrc || '',
      rlyric: result?.rlyric || result?.rlrc || '',
      lxlyric: result?.lxlyric || result?.lxlrc || result?.awlyric || '',
      raw: result
    };
  }

  normalizeCoverResult(result) {
    if (typeof result === 'string') return result;
    return result?.url || result?.pic || result?.img || result?.cover || result;
  }

  normalizeMusicUrlResult(result, quality, provider) {
    if (typeof result === 'string') return { url: result, type: quality, provider };
    if (result?.url) return { ...result, type: result.type ?? quality, provider };
    return null;
  }

  wrapCustomApi(record, api) {
    if (api.sources || api.__lxListeners?.has?.('request')) return this.wrapLxUserApi(record, api);
    const supportedQualities = api.supportedQualities || api.supportQuality || [];
    const capabilities = api.capabilities || [
      api.search ? 'search' : null,
      api.getMusicUrl ? 'url' : null,
      api.getLyric ? 'lyric' : null,
      api.getCover || api.getPic ? 'cover' : null,
      api.getAlbumDetail ? 'album' : null,
      api.getSingerDetail ? 'singer' : null,
      api.getMusicDetail ? 'detail' : null
    ].filter(Boolean);

    const call = async (name, ...args) => {
      const fn = api[name];
      if (!fn) {
        throw new AppError(ERROR_CODES.SOURCE_CAPABILITY_UNSUPPORTED, `Source does not support capability: ${name}`, { id: record.id, capability: name }, 422);
      }
      const result = await fn(...args);
      if (result && typeof result === 'object' && 'promise' in result) return result.promise;
      return result;
    };

    return {
      id: record.id,
      name: record.name || api.name || api.__scriptInfo?.name || record.id,
      type: 'custom',
      enabled: record.enabled,
      initialized: true,
      version: api.__scriptInfo?.version || api.version || record.version || '0.0.0',
      updateUrl: record.updateUrl,
      update: this.publicUpdateInfo(record),
      supportedQualities,
      capabilities,
      async search(options) { return call('search', options); },
      async getMusicUrl(songInfo, quality) { return call('getMusicUrl', songInfo, quality); },
      async getLyric(songInfo) { return call('getLyric', songInfo); },
      async getCover(songInfo) {
        if (api.getCover) return call('getCover', songInfo);
        return call('getPic', songInfo);
      },
      async getAlbumDetail(payload) { return call('getAlbumDetail', payload); },
      async getSingerDetail(payload) { return call('getSingerDetail', payload); },
      async getMusicDetail(payload) { return call('getMusicDetail', payload); }
    };
  }

  wrapLxUserApi(record, api) {
    const lxSources = api.sources || {};
    const requestHandler = api.__lxListeners?.get?.('request');
    const sourceEntries = Object.values(lxSources);
    const hasAction = action => sourceEntries.some(source => {
      const actions = Array.isArray(source?.actions) ? source.actions : [];
      return actions.includes(action);
    });
    const qualities = new Set();
    const platformQualities = {};
    for (const source of sourceEntries) {
      const sourceQualities = source?.qualitys || source?.qualities || DEFAULT_SOURCE_QUALITIES;
      for (const quality of sourceQualities) qualities.add(quality);
    }
    for (const [platform, source] of Object.entries(lxSources)) {
      platformQualities[platform] = source?.qualitys || source?.qualities || DEFAULT_SOURCE_QUALITIES;
    }
    const capabilities = [
      hasAction('musicUrl') ? 'url' : null,
      hasAction('lyric') ? 'lyric' : null,
      hasAction('pic') || hasAction('cover') ? 'cover' : null,
      hasAction('search') ? 'search' : null,
      hasAction('album') ? 'album' : null,
      hasAction('singer') ? 'singer' : null,
      hasAction('musicDetail') ? 'detail' : null
    ].filter(Boolean);
    if (requestHandler && !capabilities.length && Object.keys(lxSources).length) capabilities.push('url');

    const callRequest = async payload => {
      if (!requestHandler) {
        throw new AppError(ERROR_CODES.SOURCE_CAPABILITY_UNSUPPORTED, 'Custom LX source has no request handler', { id: record.id }, 422);
      }
      const result = await requestHandler(payload);
      if (result && typeof result === 'object' && 'promise' in result) return result.promise;
      return result;
    };
    const manager = this;

    return {
      id: record.id,
      name: record.name || api.__scriptInfo?.name || api.name || api.sourceName || record.id,
      type: 'custom',
      enabled: record.enabled,
      initialized: true,
      version: api.__scriptInfo?.version || api.version || record.version || '0.0.0',
      updateUrl: record.updateUrl,
      update: this.publicUpdateInfo(record),
      supportedQualities: qualities.size ? Array.from(qualities) : DEFAULT_SOURCE_QUALITIES,
      capabilities,
      lxSources: Object.keys(lxSources),
      platforms: Object.keys(lxSources),
      platformQualities,
      async getMusicUrl(songInfo, quality) {
        const requestQuality = songInfo.source === 'local' ? null : quality;
        const result = await callRequest({
          action: 'musicUrl',
          source: songInfo.source,
          info: {
            type: requestQuality,
            musicInfo: songInfo
          }
        });
        const normalized = manager.normalizeMusicUrlResult(result, requestQuality, record.id);
        if (normalized) return normalized;
        throw new AppError(ERROR_CODES.MUSIC_NOT_FOUND, 'Music URL not found from LX source', { id: record.id, source: songInfo.source }, 404);
      },
      async getLyric(songInfo) {
        const result = await callRequest({ action: 'lyric', source: songInfo.source, info: { musicInfo: songInfo } });
        return manager.normalizeLyricResult(result);
      },
      async getCover(songInfo) {
        const result = await callRequest({ action: 'pic', source: songInfo.source, info: { musicInfo: songInfo } });
        return manager.normalizeCoverResult(result);
      },
      async search(options) {
        const result = await callRequest({ action: 'search', source: options.source, info: options });
        return manager.normalizeSearchResult(result, options);
      },
      async getAlbumDetail(payload) {
        return callRequest({ action: 'album', source: payload.source || payload.songInfo?.source, info: payload });
      },
      async getSingerDetail(payload) {
        return callRequest({ action: 'singer', source: payload.source || payload.songInfo?.source, info: payload });
      },
      async getMusicDetail(payload) {
        return callRequest({ action: 'musicDetail', source: payload.source || payload.songInfo?.source, info: payload });
      }
    };
  }
}
