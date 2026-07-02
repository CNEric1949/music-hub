import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureDir, readJsonFile } from '../../shared/fs.js';

const TASK_TABLE = 'download_tasks';

export class DownloadTaskStore {
  constructor({ dbPath, legacyPath, logger = console }) {
    this.dbPath = dbPath;
    this.legacyPath = legacyPath;
    this.logger = logger;
    this.db = null;
  }

  async init() {
    await ensureDir(path.dirname(this.dbPath));
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${TASK_TABLE} (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        task_json TEXT NOT NULL
      )
    `);
    await this.migrateLegacyJson();
  }

  async migrateLegacyJson() {
    if (!this.legacyPath) return;
    const tasks = await readJsonFile(this.legacyPath, []);
    if (!Array.isArray(tasks) || !tasks.length) return;
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO ${TASK_TABLE} (id, status, created_at, updated_at, task_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const task of tasks) {
      if (!task?.id) continue;
      insert.run(
        task.id,
        task.status || 'waiting',
        task.createdAt || null,
        task.updatedAt || null,
        JSON.stringify(task)
      );
    }
  }

  loadAll() {
    const rows = this.db.prepare(`SELECT task_json FROM ${TASK_TABLE} ORDER BY created_at, id`).all();
    return rows.map(row => {
      try {
        return JSON.parse(row.task_json);
      } catch (error) {
        this.logger.warn(`Invalid download task row ignored: ${error.message}`);
        return null;
      }
    }).filter(Boolean);
  }

  save(task) {
    this.db.prepare(`
      INSERT INTO ${TASK_TABLE} (id, status, created_at, updated_at, task_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        task_json = excluded.task_json
    `).run(
      task.id,
      task.status || 'waiting',
      task.createdAt || null,
      task.updatedAt || null,
      JSON.stringify(task)
    );
  }

  saveAll(tasks) {
    this.db.exec('BEGIN');
    try {
      for (const task of tasks) this.save(task);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  delete(id) {
    this.db.prepare(`DELETE FROM ${TASK_TABLE} WHERE id = ?`).run(id);
  }
}
