import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureDir } from '../../shared/fs.js';

const SOURCE_TABLE = 'music_sources';

export class SourceRegistryStore {
  constructor({ dbPath, logger = console }) {
    this.dbPath = dbPath;
    this.logger = logger;
    this.db = null;
  }

  async init() {
    await ensureDir(path.dirname(this.dbPath));
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${SOURCE_TABLE} (
        id TEXT PRIMARY KEY,
        file_name TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT,
        updated_at TEXT,
        record_json TEXT NOT NULL
      )
    `);
    this.ensureColumns();
  }

  ensureColumns() {
    const columns = new Set(this.db.prepare(`PRAGMA table_info(${SOURCE_TABLE})`).all().map(column => column.name));
    if (!columns.has('created_at')) this.db.exec(`ALTER TABLE ${SOURCE_TABLE} ADD COLUMN created_at TEXT`);
  }

  loadAll() {
    const rows = this.db.prepare(`SELECT record_json FROM ${SOURCE_TABLE} ORDER BY created_at, id`).all();
    return rows.map(row => {
      try {
        return JSON.parse(row.record_json);
      } catch (error) {
        this.logger.warn(`Invalid source registry row ignored: ${error.message}`);
        return null;
      }
    }).filter(Boolean);
  }

  save(record) {
    this.db.prepare(`
      INSERT INTO ${SOURCE_TABLE} (id, file_name, enabled, created_at, updated_at, record_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_name = excluded.file_name,
        enabled = excluded.enabled,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        record_json = excluded.record_json
    `).run(
      record.id,
      record.fileName || null,
      record.enabled === false ? 0 : 1,
      record.createdAt || null,
      record.updatedAt || null,
      JSON.stringify(record)
    );
  }

  saveAll(records) {
    this.db.exec('BEGIN');
    try {
      for (const record of records) this.save(record);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  delete(id) {
    this.db.prepare(`DELETE FROM ${SOURCE_TABLE} WHERE id = ?`).run(id);
  }
}
