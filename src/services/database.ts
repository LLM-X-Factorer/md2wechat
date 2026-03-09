import path from 'node:path';
import { Kysely, SqliteDialect, PostgresDialect, sql } from 'kysely';
import type { PublishRecord } from '../types/index.js';

interface Database {
  publish_records: PublishRecord;
}

let db: Kysely<Database> | null = null;

export async function initDatabase(databaseUrl?: string, dataDir?: string): Promise<Kysely<Database>> {
  if (db) return db;

  if (databaseUrl && databaseUrl.startsWith('postgresql')) {
    // PostgreSQL
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: databaseUrl });
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool }) as any,
    });
  } else {
    // SQLite (default)
    const { default: BetterSqlite3 } = await import('better-sqlite3');
    const dbPath = path.join(dataDir ?? 'data', 'md2wechat.db');
    const sqliteDb = new BetterSqlite3(dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: sqliteDb }) as any,
    });
  }

  // Auto-migrate
  await createTables(db);

  return db;
}

async function createTables(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('publish_records')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('author', 'text')
    .addColumn('media_id', 'text', (col) => col.notNull())
    .addColumn('thumb_media_id', 'text', (col) => col.notNull())
    .addColumn('cover_url', 'text')
    .addColumn('cover_strategy', 'text', (col) => col.notNull().defaultTo('sharp'))
    .addColumn('theme', 'text')
    .addColumn('digest', 'text')
    .addColumn('enable_comment', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('draft'))
    .addColumn('error_message', 'text')
    .addColumn('webhook_status', 'text')
    .addColumn('webhook_url', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();
}

export function getDatabase(): Kysely<Database> {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    if (!db) return false;
    await sql`SELECT 1`.execute(db);
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}
