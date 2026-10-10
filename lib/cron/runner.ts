// CRON-02 runner: secret gate (x-cron-secret), structured start/end/error
// logging, CronRun ledger, admin notification after 2 consecutive failures.
import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, notFound } from '@/lib/api/response';
import { cronRepository } from '@/lib/db/repositories/cron.repo';
import { notifyAllAdmins } from '@/lib/notifications/admin-alerts';
import { logger, setRequestId, newRequestId } from '@/lib/observability/logger';
import { captureErrorSafe } from '@/lib/observability/sentry';
import { cronTasks } from './tasks';

export function cronSecretOk(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('x-cron-secret') === secret;
}

export async function runCronTask(taskId: string, request: NextRequest): Promise<NextResponse> {
  if (!cronSecretOk(request)) return notFound('Not found');
  const handler = cronTasks[taskId];
  if (!handler) return notFound('Not found');
  setRequestId(newRequestId());
  logger.info('cron.start', { task: taskId });
  let runId: string | null = null;
  try {
    runId = await cronRepository.beginRun(taskId);
  } catch {
    // Ledger unavailable (fresh DB without migration) — still run the task.
  }
  try {
    const data = await handler();
    if (runId) await cronRepository.finishRun(runId, 'ok', JSON.stringify(data));
    logger.info('cron.end', { task: taskId, ...data });
    setRequestId(null);
    return ok(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron task failed';
    let failures = 1;
    try {
      if (runId) failures = await cronRepository.finishRun(runId, 'error', message);
    } catch { /* ledger best effort */ }
    logger.error('cron.error', { task: taskId, error: message, failures });
    await captureErrorSafe(err, { task: taskId });
    if (failures >= 2) {
      await notifyAllAdmins({
        title: `Cron task failing: ${taskId}`,
        body: `Task ${taskId} failed ${failures} consecutive times. Last error: ${message.slice(0, 300)}`,
        // Historical behaviour: the first failed notify aborts the remaining
        // recipients, and the outer handler swallows it.
        isolate: false,
      });
    }
    setRequestId(null);
    return fail('TASK_FAILED', message, 500);
  }
}
