import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import { DownloadTaskStore } from './task-store.js';
import { ensureDir, pathExists, safeJoin } from '../../shared/fs.js';
import { extForQuality, sanitizeFileName } from '../../shared/text.js';

const TASKS_DB_FILE = 'music-hub.sqlite';
const terminalStatuses = new Set(['completed', 'canceled']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
const numberOrDefault = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

export class DownloadService {
  constructor(config, mediaService, searchService, metadataService, logger = console) {
    this.config = config;
    this.mediaService = mediaService;
    this.searchService = searchService;
    this.metadataService = metadataService;
    this.logger = logger;
    this.taskStore = new DownloadTaskStore({
      dbPath: path.join(config.paths.dataDir, TASKS_DB_FILE),
      logger
    });
    this.tasks = new Map();
    this.running = new Map();
  }

  async init() {
    await this.taskStore.init();
    const saved = this.taskStore.loadAll();
    for (const task of saved) this.tasks.set(task.id, task);
    if (this.config.download.resumeOnStartup) {
      for (const task of this.tasks.values()) {
        if (!terminalStatuses.has(task.status)) {
          task.status = 'paused';
          task.error = task.error || { message: 'Paused after service restart' };
        }
      }
      await this.persist();
    }
  }

  async persist() {
    this.taskStore.saveAll(Array.from(this.tasks.values()));
  }

  list() {
    return Array.from(this.tasks.values());
  }

  get(id) {
    const task = this.tasks.get(id);
    if (!task) throw new AppError(ERROR_CODES.DOWNLOAD_TASK_NOT_FOUND, `Download task not found: ${id}`, { id }, 404);
    return task;
  }

  async create(options) {
    const downloadOptions = { ...this.config.download, ...(options.options || {}) };
    const quality = options.quality || options.type || downloadOptions.quality || '320k';
    const explicitProvider = options.provider || options.providerId || options.sourceId || null;
    const platform = options.platform || (explicitProvider && options.source ? options.source : null) || (!explicitProvider ? options.source : null) || null;
    const provider = explicitProvider || (options.platform ? options.source : null) || null;
    const task = {
      id: randomUUID(),
      status: 'waiting',
      musicInfo: options.songInfo || options.musicInfo,
      quality,
      qualityStrategy: options.qualityStrategy || downloadOptions.qualityStrategy || 'specified',
      sourceStrategy: options.sourceStrategy || downloadOptions.sourceStrategy || 'specified',
      platform,
      provider,
      url: options.url || null,
      filePath: '',
      customFileName: Boolean(options.fileName),
      artifacts: {},
      progress: { total: 0, downloaded: 0, percent: 0, speed: 0 },
      attempts: 0,
      maxRetries: numberOrDefault(options.retryCount ?? downloadOptions.retryCount, 3),
      retryIntervalMs: numberOrDefault(options.retryIntervalMs ?? downloadOptions.retryIntervalMs, 5000),
      options: downloadOptions,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (!task.musicInfo) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'songInfo is required', {}, 400);
    const ext = extForQuality(task.quality);
    const fileName = sanitizeFileName(options.fileName || `${task.musicInfo.name || task.musicInfo.songmid || task.id} - ${task.musicInfo.singer || 'unknown'}.${ext}`);
    task.filePath = safeJoin(this.config.paths.downloadDir, fileName);
    this.tasks.set(task.id, task);
    await this.persist();
    if (options.autoStart ?? true) void this.resume(task.id);
    return task;
  }

  async pause(id) {
    const task = this.get(id);
    const running = this.running.get(id);
    if (running) {
      running.destroy();
      this.running.delete(id);
    }
    if (task.status !== 'completed') task.status = 'paused';
    task.updatedAt = new Date().toISOString();
    await this.persist();
    return task;
  }

  async cancel(id) {
    const task = await this.pause(id);
    task.status = 'canceled';
    task.updatedAt = new Date().toISOString();
    await this.persist();
    return task;
  }

  async delete(id) {
    const task = await this.pause(id);
    task.status = 'canceled';
    this.tasks.delete(id);
    this.taskStore.delete(id);
    return { ...task, deleted: true };
  }

  async retry(id) {
    const task = this.get(id);
    task.status = 'waiting';
    task.error = null;
    task.url = null;
    task.attempts = 0;
    await this.persist();
    return this.resume(id);
  }

  async resume(id) {
    const task = this.get(id);
    if (terminalStatuses.has(task.status)) return task;
    if (this.running.has(id)) return task;
    task.status = 'running';
    task.error = null;
    task.updatedAt = new Date().toISOString();
    await this.persist();

    try {
      await this.runWithRetries(task);
      task.status = 'completed';
      task.progress.percent = 100;
      task.updatedAt = new Date().toISOString();
      await this.afterComplete(task);
    } catch (error) {
      if (task.status !== 'paused' && task.status !== 'canceled') {
        task.status = 'failed';
        task.error = { message: error.message, code: error.code || ERROR_CODES.INTERNAL_ERROR };
      }
    } finally {
      this.running.delete(id);
      await this.persist();
    }
    return task;
  }

  async runWithRetries(task) {
    const maxRetries = numberOrDefault(task.maxRetries ?? task.options?.retryCount, 3);
    const retryIntervalMs = numberOrDefault(task.retryIntervalMs ?? task.options?.retryIntervalMs, 5000);
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      task.attempts = attempt + 1;
      task.updatedAt = new Date().toISOString();
      await this.persist();
      try {
        if (!task.url) task.url = await this.resolveUrl(task);
        await this.download(task);
        return;
      } catch (error) {
        lastError = error;
        if (task.status === 'paused' || task.status === 'canceled') throw error;
        if (attempt >= maxRetries) break;
        task.status = 'retrying';
        task.error = { message: error.message, code: error.code || ERROR_CODES.INTERNAL_ERROR, attempt: attempt + 1 };
        await this.persist();
        await sleep(retryIntervalMs);
        if (task.status === 'paused' || task.status === 'canceled') throw error;
      }
    }
    throw lastError;
  }

  chooseQuality(task, musicInfo) {
    const qualities = musicInfo.types?.map(item => item.type) || [task.quality];
    const order = ['flac24bit', 'flac', '320k', '192k', '128k'];
    if (task.qualityStrategy === 'highest') return order.find(q => qualities.includes(q)) || qualities[0] || task.quality;
    if (task.qualityStrategy === 'lowest') return [...order].reverse().find(q => qualities.includes(q)) || qualities[0] || task.quality;
    return task.quality;
  }

  async resolveUrl(task) {
    const baseMusicInfo = task.platform ? { ...task.musicInfo, source: task.platform } : task.musicInfo;
    const candidates = [baseMusicInfo];
    if (task.sourceStrategy === 'all') {
      const matched = await this.searchService.match({
        name: baseMusicInfo.name,
        singer: baseMusicInfo.singer,
        albumName: baseMusicInfo.albumName,
        interval: baseMusicInfo.interval,
        source: baseMusicInfo.source
      });
      candidates.push(...matched.list);
    }
    for (const item of candidates) {
      try {
        const quality = this.chooseQuality(task, item);
        const result = await this.mediaService.getMusicUrl(item, quality, null, task.provider);
        task.musicInfo = item;
        task.quality = result.type || quality;
        task.provider = result.provider || task.provider || null;
        if (!task.customFileName) task.filePath = this.defaultFilePath(task);
        return result.url;
      } catch (error) {
        this.logger.warn(`URL resolve failed for ${item.source}: ${error.message}`);
      }
    }
    throw new AppError(ERROR_CODES.MUSIC_NOT_FOUND, 'No downloadable URL found', {}, 404);
  }

  defaultFilePath(task) {
    const ext = extForQuality(task.quality);
    const fileName = sanitizeFileName(`${task.musicInfo.name || task.musicInfo.songmid || task.id} - ${task.musicInfo.singer || 'unknown'}.${ext}`);
    return safeJoin(this.config.paths.downloadDir, fileName);
  }

  async download(task) {
    if (!task.url) throw new AppError(ERROR_CODES.MUSIC_NOT_FOUND, 'Download URL is empty', {}, 404);
    await ensureDir(path.dirname(task.filePath));

    let downloaded = 0;
    if (await pathExists(task.filePath)) {
      const stat = await fsp.stat(task.filePath);
      downloaded = stat.size;
      if (task.options?.skipExistingFile && downloaded > 0 && task.progress.total && downloaded >= task.progress.total) {
        task.progress.downloaded = downloaded;
        task.progress.percent = 100;
        return;
      }
    }

    const target = new URL(task.url);
    if (target.protocol === 'file:') {
      await this.downloadFileUrl(task, target, downloaded);
      return;
    }
    const transport = target.protocol === 'https:' ? https : http;
    const headers = downloaded > 0 ? { Range: `bytes=${downloaded}-` } : {};

    await new Promise((resolve, reject) => {
      const req = transport.get(task.url, { headers }, res => {
        if (![200, 206].includes(res.statusCode || 0)) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const resumed = downloaded > 0 && res.statusCode === 206;
        if (downloaded > 0 && res.statusCode === 200) downloaded = 0;
        const total = Number(res.headers['content-length'] || 0) + (resumed ? downloaded : 0);
        const stream = fs.createWriteStream(task.filePath, { flags: resumed ? 'a' : 'w' });
        let last = Date.now();
        let lastBytes = downloaded;
        task.progress.total = total;
        task.progress.downloaded = downloaded;

        res.on('data', chunk => {
          downloaded += chunk.length;
          task.progress.downloaded = downloaded;
          task.progress.percent = total ? Math.round((downloaded / total) * 10000) / 100 : 0;
          const now = Date.now();
          if (now - last >= 1000) {
            task.progress.speed = downloaded - lastBytes;
            lastBytes = downloaded;
            last = now;
            void this.persist();
          }
        });
        res.pipe(stream);
        stream.on('finish', resolve);
        stream.on('error', reject);
        res.on('error', error => {
          stream.destroy();
          reject(error);
        });
      });
      this.running.set(task.id, req);
      req.on('error', reject);
    });
  }

  async downloadFileUrl(task, target, downloaded) {
    const sourcePath = target.pathname;
    const stat = await fsp.stat(sourcePath);
    task.progress.total = stat.size;
    task.progress.downloaded = downloaded;

    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(sourcePath, { start: downloaded });
      const writeStream = fs.createWriteStream(task.filePath, { flags: downloaded > 0 ? 'a' : 'w' });
      readStream.on('data', chunk => {
        downloaded += chunk.length;
        task.progress.downloaded = downloaded;
        task.progress.percent = stat.size ? Math.round((downloaded / stat.size) * 10000) / 100 : 0;
      });
      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      readStream.pipe(writeStream);
    });
  }

  async afterComplete(task) {
    task.artifacts = task.artifacts || {};
    let lyricInfo = null;
    let coverPath = null;
    if (task.options.saveLyricFile || task.options.embedLyric) {
      try {
        lyricInfo = await this.mediaService.getLyric(task.musicInfo);
        if (task.options.saveLyricFile) {
          const savedLyric = await this.mediaService.saveLyric({ songInfo: task.musicInfo, lyricInfo });
          task.artifacts.lyrics = savedLyric.files || { lyric: savedLyric.filePath };
        }
      } catch (error) {
        this.logger.warn(`Lyric post-process failed: ${error.message}`);
      }
    }
    if (task.options.embedCover || task.options.saveCoverFile) {
      try {
        const cover = await this.mediaService.downloadCover({ songInfo: task.musicInfo });
        coverPath = cover.filePath;
        task.artifacts.cover = cover.filePath;
      } catch (error) {
        this.logger.warn(`Cover post-process failed: ${error.message}`);
      }
    }
    if (task.options.embedCover || task.options.embedLyric) {
      const embedded = await this.metadataService.embed({
        filePath: task.filePath,
        meta: {
          title: task.musicInfo.name,
          artist: task.musicInfo.singer,
          album: task.musicInfo.albumName
        },
        lyricInfo,
        coverPath
      });
      task.artifacts.metadata = embedded;
    }
  }
}
