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
      approvedAt TEXT,
      appliedAt TEXT,
      FOREIGN KEY (runId) REFERENCES runs(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS metrics_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recordedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      failuresSeen INTEGER NOT NULL,
      fixesSuggested INTEGER NOT NULL,
      fixesApplied INTEGER NOT NULL,
      passRateBefore REAL,
      passRateAfter REAL,
      avgTimeToFixMs REAL
    )
  `);

  await ensureSuggestionColumns();

  initialized = true;
}

async function ensureSuggestionColumns() {
  const columns = await all('PRAGMA table_info(suggestions)');
  const names = columns.map((col) => col.name);
  const additions = [];
  if (!names.includes('approvedAt')) {
    additions.push(run('ALTER TABLE suggestions ADD COLUMN approvedAt TEXT'));
  }
  if (!names.includes('appliedAt')) {
    additions.push(run('ALTER TABLE suggestions ADD COLUMN appliedAt TEXT'));
  }
  if (additions.length) {
    await Promise.allSettled(additions);
  }
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
  const column =
    status === 'approved'
      ? 'approvedAt'
      : status === 'applied'
        ? 'appliedAt'
        : null;

  const updates = ['status = ?', 'updatedAt = CURRENT_TIMESTAMP'];
  if (column) {
    updates.push(`${column} = CURRENT_TIMESTAMP`);
  }

  await run(
    `
      UPDATE suggestions
      SET ${updates.join(', ')}
      WHERE id = ?
    `,
    [status, id],
  );
}

export async function computeMetrics({
  passRateWindow = Number(process.env.METRICS_PASSRATE_WINDOW ?? 10),
} = {}) {
  await initDatabase();

  const failuresRow = await get(
    `SELECT COUNT(*) as count FROM runs WHERE status = 'failed'`,
  );
  const suggestionsRow = await get(
    `SELECT COUNT(*) as count FROM suggestions`,
  );
  const appliedRow = await get(
    `SELECT COUNT(*) as count FROM suggestions WHERE status = 'applied'`,
  );

  const recentRuns = await all(
    `
      SELECT status
      FROM runs
      ORDER BY createdAt DESC
      LIMIT ?
    `,
    [passRateWindow * 2],
  );

  const recentSlice = recentRuns.slice(0, passRateWindow);
  const previousSlice = recentRuns.slice(passRateWindow, passRateWindow * 2);

  const passRateAfter = calculatePassRate(recentSlice);
  const passRateBefore =
    previousSlice.length > 0 ? calculatePassRate(previousSlice) : passRateAfter;

  const timeRows = await all(
    `
      SELECT createdAt, appliedAt
      FROM suggestions
      WHERE appliedAt IS NOT NULL
    `,
  );

  const avgTimeToFixMs =
    timeRows.length > 0
      ? Math.round(
          timeRows.reduce((sum, row) => {
            const applied = toMillis(row.appliedAt);
            const created = toMillis(row.createdAt);
            if (!applied || !created) return sum;
            return sum + Math.max(applied - created, 0);
          }, 0) / timeRows.length,
        )
      : null;

  return {
    failuresSeen: failuresRow?.count ?? 0,
    fixesSuggested: suggestionsRow?.count ?? 0,
    fixesApplied: appliedRow?.count ?? 0,
    passRateBefore,
    passRateAfter,
    avgTimeToFixMs,
    passRateWindow,
    generatedAt: new Date().toISOString(),
  };
}

export async function recordMetricsSnapshot(metrics) {
  await initDatabase();
  await run(
    `
      INSERT INTO metrics_snapshots (
        failuresSeen,
        fixesSuggested,
        fixesApplied,
        passRateBefore,
        passRateAfter,
        avgTimeToFixMs
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      metrics.failuresSeen,
      metrics.fixesSuggested,
      metrics.fixesApplied,
      metrics.passRateBefore,
      metrics.passRateAfter,
      metrics.avgTimeToFixMs,
    ],
  );
}

export async function recordMetricsSnapshotFromCurrent() {
  const metrics = await computeMetrics({});
  await recordMetricsSnapshot(metrics);
  return metrics;
}

export async function getMetricsSnapshots(limit = 50) {
  await initDatabase();
  return all(
    `
      SELECT *
      FROM metrics_snapshots
      ORDER BY recordedAt DESC
      LIMIT ?
    `,
    [limit],
  );
}

function calculatePassRate(rows) {
  if (!rows.length) return null;
  const passed = rows.filter((row) => row.status === 'passed').length;
  return Number((passed / rows.length).toFixed(2));
}

function toMillis(value) {
  if (!value) return null;
  const date = new Date(`${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

