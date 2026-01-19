import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

function initializeDatabase(): DatabaseType {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const dbPath = path.join(dataDir, 'pins.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.prepare(`CREATE TABLE IF NOT EXISTS pinned_workflows_v2 (
    repo TEXT NOT NULL,
    workflow_id INTEGER NOT NULL,
    PRIMARY KEY (repo, workflow_id)
  )`).run();
  
  return db;
}

const db = initializeDatabase();

export function getPinnedIds(repo: string): number[] {
  const rows = db.prepare('SELECT workflow_id FROM pinned_workflows_v2 WHERE repo = ?').all(repo) as Array<{ workflow_id: number }>;
  return rows.map((r) => r.workflow_id);
}

export function isPinned(repo: string, id: number): boolean {
  const row = db.prepare('SELECT workflow_id FROM pinned_workflows_v2 WHERE repo = ? AND workflow_id = ?').get(repo, id);
  return !!row;
}

export function pinWorkflow(repo: string, id: number): void {
  db.prepare('INSERT OR IGNORE INTO pinned_workflows_v2(repo, workflow_id) VALUES (?, ?)').run(repo, id);
}

export function unpinWorkflow(repo: string, id: number): void {
  db.prepare('DELETE FROM pinned_workflows_v2 WHERE repo = ? AND workflow_id = ?').run(repo, id);
}
