import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface CronRunRow {
  id: string;
  task: string;
  started_at: Date;
  finished_at: Date | null;
  status: 'running' | 'ok' | 'error';
  detail: string | null;
  consecutive_failures: number;
}

// CronRun ledger: last-run per task + consecutive-failure counting for
// the double-failure admin alert (OBS-04).
export const cronRepository = {
  async beginRun(task: string): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      "INSERT INTO CronRun (id, task, status) VALUES (?, ?, 'running')",
      [id, task]
    );
    return id;
  },

  async finishRun(id: string, status: 'ok' | 'error', detail: string | null = null): Promise<number> {
    const prev = await executeQuery<Array<{ consecutive_failures: number; status: string }>>(
      'SELECT consecutive_failures, status FROM CronRun WHERE task = (SELECT task FROM CronRun WHERE id = ?) ORDER BY started_at DESC LIMIT 2',
      [id, id]
    );
    let failures = 0;
    if (status === 'error') {
      const last = prev.find((r) => r.status !== 'running');
      failures = (last && last.status === 'error' ? Number(last.consecutive_failures) : 0) + 1;
    }
    await executeQuery(
      'UPDATE CronRun SET status = ?, finished_at = ?, detail = ?, consecutive_failures = ? WHERE id = ?',
      [status, new Date(), detail ? detail.slice(0, 2000) : null, failures, id]
    );
    return failures;
  },

  async lastRuns(limit = 30): Promise<CronRunRow[]> {
    return executeQuery<CronRunRow[]>(
      `SELECT r.* FROM CronRun r
       INNER JOIN (SELECT task, MAX(started_at) AS m FROM CronRun GROUP BY task) latest
         ON r.task = latest.task AND r.started_at = latest.m
       ORDER BY r.started_at DESC LIMIT ?`,
      [limit]
    );
  },

  async recentErrors(limit = 20): Promise<CronRunRow[]> {
    return executeQuery<CronRunRow[]>(
      "SELECT * FROM CronRun WHERE status = 'error' ORDER BY started_at DESC LIMIT ?",
      [limit]
    );
  },
};
