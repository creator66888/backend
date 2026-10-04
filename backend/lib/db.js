const { Pool } = require('pg');

let pool = null;
let schemaPromise = null;
let createdAtCol = '"createdAt"';

function resolveConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.hi_POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.hi_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.hi_DATABASE_URL ||
    null
  );
}

// No database connection string available (e.g. running locally) -> the API
// falls back to a JSON file store. On Vercel the env vars always exist, so
// the deployed behaviour is unchanged.
function isFileStoreMode() {
  return !resolveConnectionString();
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveConnectionString(),
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }
  return pool;
}

async function ensureSchema(db = getPool()) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          token TEXT NOT NULL,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL,
          service TEXT NOT NULL,
          date TEXT NOT NULL,
          day TEXT NOT NULL,
          time TEXT NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          status TEXT NOT NULL DEFAULT 'pending'
        );
      `);
      const { rows } = await db.query(
        `SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'appointments'`
      );
      const names = rows.map((r) => r.column_name);
      createdAtCol = names.includes('createdAt') ? '"createdAt"' : 'created_at';
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  await schemaPromise;
  return createdAtCol;
}

let messagesSchemaPromise = null;

async function ensureMessagesSchema(db = getPool()) {
  if (!messagesSchemaPromise) {
    messagesSchemaPromise = db
      .query(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          subject TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'new',
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `)
      .catch((err) => {
        messagesSchemaPromise = null;
        throw err;
      });
  }
  await messagesSchemaPromise;
}

function getCreatedAtColumn() {
  return createdAtCol;
}

function normalizeRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.createdAt === undefined && out.created_at !== undefined) {
    out.createdAt = out.created_at;
  }
  delete out.created_at;
  return out;
}

function setCors(res) {
  const allowedOrigin =
    process.env.ALLOWED_ORIGIN || 'https://frontend-1-sage.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

module.exports = {
  getPool,
  isFileStoreMode,
  ensureSchema,
  ensureMessagesSchema,
  getCreatedAtColumn,
  normalizeRow,
  setCors,
  DAYS,
};
