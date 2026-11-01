import { createClient, Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';

function resolveDatabaseUrl(): string {
  const rawUrl = process.env.DATABASE_URL || 'file:./local.db';
  if (!rawUrl.startsWith('file:')) {
    return rawUrl;
  }

  const filePath = rawUrl.slice(5);
  if (path.isAbsolute(filePath)) {
    return rawUrl;
  }

  // Check current working directory
  const cwdPath = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(cwdPath)) {
    return `file:${cwdPath}`;
  }

  // When Next.js standalone runs, process.chdir(__dirname) changes cwd to .next/standalone
  // Resolve against project root if local.db is located two levels up
  const standaloneParentPath = path.resolve(process.cwd(), '../../', filePath);
  if (fs.existsSync(standaloneParentPath)) {
    return `file:${standaloneParentPath}`;
  }

  return `file:${cwdPath}`;
}

const dbUrl = resolveDatabaseUrl();
const authToken = process.env.DATABASE_AUTH_TOKEN;

// Ensure parent directory exists for local SQLite database file
if (dbUrl.startsWith('file:')) {
  try {
    const targetPath = dbUrl.slice(5);
    const parentDir = path.dirname(targetPath);
    if (parentDir && !fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  } catch (err) {
    console.warn('Warning: Could not create database parent directory:', err);
  }
}

// Singleton client to prevent connection exhaustion during development hot reload
const globalForDb = globalThis as unknown as {
  libsqlClient?: Client;
  isWalConfigured?: boolean;
};

export const client: Client =
  globalForDb.libsqlClient ??
  createClient({
    url: dbUrl,
    authToken,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.libsqlClient = client;
}

const SCHEMA_INIT_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    avatar_color TEXT NOT NULL DEFAULT '#6366F1',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    start_date TEXT,
    end_date TEXT,
    currency TEXT NOT NULL DEFAULT '€',
    invite_code TEXT NOT NULL UNIQUE,
    scratchpad TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS trip_members (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'EDITOR',
    joined_at INTEGER NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS trip_members_trip_user_idx ON trip_members(trip_id, user_id);`,
  `CREATE TABLE IF NOT EXISTS pois (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'OTHER',
    status TEXT NOT NULL DEFAULT 'IDEA',
    is_must_see INTEGER NOT NULL DEFAULT 0,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    address TEXT,
    day_start INTEGER,
    day_end INTEGER,
    order_index INTEGER NOT NULL DEFAULT 0,
    time_slot TEXT,
    duration_minutes INTEGER,
    transport_mode TEXT NOT NULL DEFAULT 'DRIVING',
    estimated_cost REAL NOT NULL DEFAULT 0,
    cost_type TEXT NOT NULL DEFAULT 'TOTAL',
    paid_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    booking_reference TEXT,
    external_url TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS poi_votes (
    id TEXT PRIMARY KEY,
    poi_id TEXT NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS poi_votes_poi_user_idx ON poi_votes(poi_id, user_id);`,
  `CREATE TABLE IF NOT EXISTS poi_comments (
    id TEXT PRIMARY KEY,
    poi_id TEXT NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS checklist_items (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'BEFORE_TRIP',
    is_completed INTEGER NOT NULL DEFAULT 0,
    assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );`,
];

// Enable WAL mode & busy timeout and ensure schema tables exist
if (!globalForDb.isWalConfigured) {
  const initDb = async () => {
    try {
      if (dbUrl.startsWith('file:')) {
        await client.execute('PRAGMA journal_mode = WAL;');
        await client.execute('PRAGMA busy_timeout = 5000;');
      }
      for (const statement of SCHEMA_INIT_STATEMENTS) {
        await client.execute(statement);
      }
      globalForDb.isWalConfigured = true;
    } catch (err) {
      console.warn('Database initialization notice:', err);
    }
  };
  initDb();
}

export const db = drizzle(client, { schema });

export * from './schema';
