import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import { ensureDir, pathExists, safeJoin, readJsonFile, writeJsonFile } from '../../shared/fs.js';
import { extForQuality, sanitizeFileName } from '../../shared/text.js';

const TASKS_FILE = 'download-tasks.json';
const terminalStatuses = new Set(['completed', 'canceled']);

export class DownloadService {
  constructor(config, mediaService, searchService, metadataService, logger = console) {
    this.config = config;
    this.mediaService = mediaService;
    this.searchService = searchService;
    this.metadataService = metadataService;
    this.logger = logger;
    this.tasksPath = path.join(config.paths.dataDir, TASKS_FILE);
    this.tasks = new Map();
    this.running = new Map();
  }

  async init() {
    const saved = await readJsonFile(this.tasksPath, []);
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
    await writeJsonFile(this.tasksPath, Array.from(this.tasks.values()));
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
    const task = {
      id: randomUUID(),
      status: 'waiting',
      musicInfo: options.songInfo || options.musicInfo,
      quality: options.quality || '320k',
      qualityStrategy: options.qualityStrategy || 'specified',
      sourceStrategy: options.sourceStrategy || 'specified',
      url: options.url || null,
      filePath: '',
      artifacts: {},
      progress: { total: 0, downloaded: 0, percent: 0, speed: 0 },
      options: { ...this.config.download, ...(options.options || {}) },
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

  async retry(id) {
    const task = this.get(id);
    task.status = 'waiting';
    task.error = null;
    task.url = null;
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
      if (!task.url) task.url = await this.resolveUrl(task);
      await this.download(task);
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

  chooseQuality(task, musicInfo) {
    const qualities = musicInfo.types?.map(item => item.type) || [task.quality];
    const order = ['flac24bit', 'flac', '320k', '192k', '128k'];
    if (task.qualityStrategy === 'highest') return order.find(q => qualities.includes(q)) || qualities[0] || task.quality;
    if (task.qualityStrategy === 'lowest') return [...order].reverse().find(q => qualities.includes(q)) || qualities[0] || task.quality;
    return task.quality;
  }

  async resolveUrl(task) {
    const candidates = [task.musicInfo];
    if (task.sourceStrategy === 'all') {
      const matched = await this.searchService.match({
        name: task.musicInfo.name,
        singer: task.musicInfo.singer,
        albumName: task.musicInfo.albumName,
        interval: task.musicInfo.interval,
        source: task.musicInfo.source
      });
      candidates.push(...matched.list);
    }
    for (const item of candidates) {
      try {
        const quality = this.chooseQuality(task, item);
        const result = await this.mediaService.getMusicUrl(item, quality);
        task.musicInfo = item;
        task.quality = result.type || quality;
        return result.url;
      } catch (error) {
        this.logger.warn(`URL resolve failed for ${item.source}: ${error.message}`);
      }
    }
    throw new AppError(ERROR_CODES.MUSIC_NOT_FOUND, 'No downloadable URL found', {}, 404);
  }

  async download(task) {
    if (!task.url) throw new AppError(ERROR_CODES.MUSIC_NOT_FOUND, 'Download URL is empty', {}, 404);
    await ensureDir(path.dirname(task.filePath));

    let downloaded = 0;
    if (await pathExists(task.filePath)) {
      const stat = await fsp.stat(task.filePath);
      downloaded = stat.size;
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
        const total = Number(res.headers['content-length'] || 0) + downloaded;
        const stream = fs.createWriteStream(task.filePath, { flags: downloaded > 0 && res.statusCode === 206 ? 'a' : 'w' });
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
        res.on('error', reject);
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
      task.artifacts.metadata = embedded.sidecarPath;
    }
  }
}
