import mysql from 'mysql2/promise';
import { env } from '@/lib/env';

let pool: mysql.Pool | null = null;

export function getDbPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: env.DATABASE_HOST,
      port: env.DATABASE_PORT,
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      database: env.DATABASE_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}

/**
 * Executes a prepared statement query on the database pool.
 * Under GEMINI.md D-01 rules:
 * - NO string interpolation in SQL query strings is allowed.
 * - Always use '?' placeholder and pass parameters in the second argument.
 */
export async function executeQuery<T = unknown>(sql: string, params?: unknown[]): Promise<T> {
  const db = getDbPool();
  const [rows] = await db.execute(sql, params as never);
  return rows as T;
}
