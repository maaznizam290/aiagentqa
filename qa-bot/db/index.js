import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const sqlite = sqlite3.verbose();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databasePath = path.resolve(__dirname, 'qa-bot.sqlite');
const db = new sqlite.Database(databasePath);

let initialized = false;

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

export async function initDatabase() {
  if (initialized) return;

  await run(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      targetUrl TEXT NOT NULL,
      runner TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      result TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      runId INTEGER NOT NULL,
      testName TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'suggested',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (runId) REFERENCES runs(id)
    )
  `);

  initialized = true;
}

export async function logRunStart({ targetUrl, runner }) {
  await initDatabase();
  const { lastID } = await run(
    `
      INSERT INTO runs (targetUrl, runner, status)
      VALUES (?, ?, 'pending')
    `,
    [targetUrl, runner],
  );
  return lastID;
}

export async function markRunInProgress(id) {
  await initDatabase();
  await run(
    `
      UPDATE runs
      SET status = 'in_progress', updatedAt = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `,
    [id],
  );
}

export async function logRunFinish(id, payload) {
  await initDatabase();
  await run(
    `
      UPDATE runs
      SET status = ?, result = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [payload.status, JSON.stringify(payload), id],
  );
}

export async function getRecentRuns(limit = 25) {
  await initDatabase();
  const rows = await all(
    `
      SELECT *
      FROM runs
      ORDER BY createdAt DESC
      LIMIT ?
    `,
    [limit],
  );
  return rows.map((row) => ({
    ...row,
    result: row.result ? JSON.parse(row.result) : null,
  }));
}

export async function getPendingRuns(limit = 5) {
  await initDatabase();
  const rows = await all(
    `
      SELECT *
      FROM runs
      WHERE status = 'pending'
      ORDER BY createdAt ASC
      LIMIT ?
    `,
    [limit],
  );
  return rows;
}

export async function getRunById(id) {
  await initDatabase();
  const row = await get(
    `
      SELECT *
      FROM runs
      WHERE id = ?
    `,
    [id],
  );
  if (!row) return null;
  return {
    ...row,
    result: row.result ? JSON.parse(row.result) : null,
  };
}

export async function saveFixSuggestion({
  runId,
  testName,
  payload,
  status = 'suggested',
}) {
  await initDatabase();
  const serialized = JSON.stringify(payload);
  const { lastID } = await run(
    `
      INSERT INTO suggestions (runId, testName, payload, status)
      VALUES (?, ?, ?, ?)
    `,
    [runId, testName, serialized, status],
  );
  return lastID;
}

export async function listSuggestions({ status } = {}) {
  await initDatabase();
  const clauses = [];
  const params = [];
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await all(
    `
      SELECT *
      FROM suggestions
      ${where}
      ORDER BY createdAt DESC
    `,
    params,
  );
  return rows.map((row) => ({
    ...row,
    payload: JSON.parse(row.payload),
  }));
}

export async function updateSuggestionStatus(id, status) {
  await initDatabase();
  await run(
    `
      UPDATE suggestions
      SET status = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [status, id],
  );
}

