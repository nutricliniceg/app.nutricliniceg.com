// P32-SEED — seed-only database connection layer.
//
// WHY THIS EXISTS INSTEAD OF EDITING lib/db/pool.ts
// --------------------------------------------------
// The production pool is shared by the running app, so changing its
// connectionLimit / connectTimeout would alter live request behaviour. The
// seed is a short-lived, single-writer CLI, so it gets its OWN pool, wired in
// by scripts/alias-hook.mjs which redirects `@/lib/db/pool` here when the
// seed runs. Every repository keeps importing the production path; only the
// resolved module differs. Production config is therefore untouched.
//
// TUNING RATIONALE (SSH-tunnel staging)
// -------------------------------------
// The staging DB is reached through an SSH local-forward (127.0.0.1:3307),
// where the tunnel—not MySQL—drops idle sockets. Hence:
//   connectTimeout: 30000      fail fast instead of hanging on a dead forward
//   enableKeepAlive / delay     probe the socket before the tunnel reaps it
//   connectionLimit: 2          one writer plus one spare; avoids piling
//                               several sockets onto a fragile forward
import mysql from 'mysql2/promise';
import { env } from '@/lib/env';

let pool: mysql.Pool | null = null;

export interface SeedPoolOptions {
  connectionLimit: number;
  connectTimeout: number;
  enableKeepAlive: boolean;
  keepAliveInitialDelay: number;
}

export const SEED_POOL_OPTIONS: SeedPoolOptions = {
  connectionLimit: 2,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
};

export function getDbPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DATABASE_HOST,
      port: env.DATABASE_PORT,
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      database: env.DATABASE_NAME,
      waitForConnections: true,
      queueLimit: 0,
      ...SEED_POOL_OPTIONS,
    });
  }
  return pool;
}

/** The last statement handed to the pool, so a failure report can show it. */
let lastSql = '';

export function lastExecutedSql(): string {
  return lastSql;
}

/**
 * Attaches the failing SQL (and params shape) to the error so the final
 * failure report can print it. Non-enumerable so it never leaks into logs
 * that JSON-stringify the error.
 */
function attachStatement(err: unknown, sql: string, params?: unknown[]): unknown {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    try {
      Object.defineProperty(e, 'seedSql', { value: sql, enumerable: false, configurable: true });
      Object.defineProperty(e, 'seedParams', {
        value: params ? `[${params.length} bound param(s)]` : undefined,
        enumerable: false,
        configurable: true,
      });
    } catch {
      /* frozen error object — the report falls back to lastSql */
    }
  }
  return err;
}

/**
 * Prepared-statement execution, identical contract to lib/db/pool.ts
 * (D-01: every value is a `?` placeholder; no SQL is built by interpolation).
 */
export async function executeQuery<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
  lastSql = sql;
  try {
    const db = getDbPool();
    const [rows] = await db.execute(sql, params as never);
    return rows as T;
  } catch (err) {
    throw attachStatement(err, sql, params);
  }
}

export async function closeDbPool(): Promise<void> {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end().catch(() => undefined);
}