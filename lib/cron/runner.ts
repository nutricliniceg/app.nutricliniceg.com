// CRON-02 runner: secret gate (x-cron-secret), structured start/end/error
// logging, CronRun ledger, admin notification after 2 consecutive failures.
import { NextRequest, NextResponse } from 'next/server';
import { cronRepository } from '@/lib/db/repositories/cron.repo';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { notificationService } from '@/lib/notifications/service';
import { logger, setRequestId, newRequestId } from '@/lib/observability/logger';
import { captureErrorSafe } from '@/lib/observability/sentry';
import { cronTasks } from './tasks';

export function cronSecretOk(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('x-cron-secret') === secret;
}

function notFound() {
  return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
}

export async function runCronTask(taskId: string, request: NextRequest): Promise<NextResponse> {
  if (!cronSecretOk(request)) return notFound();
  const handler = cronTasks[taskId];
  if (!handler) return notFound();
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
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron task failed';
    let failures = 1;
    try {
      if (runId) failures = await cronRepository.finishRun(runId, 'error', message);
    } catch { /* ledger best effort */ }
    logger.error('cron.error', { task: taskId, error: message, failures });
    await captureErrorSafe(err, { task: taskId });
    if (failures >= 2) {
      try {
        const admins = await userRepository.listAllForBroadcast(null);
        for (const a of admins.filter((u) => u.role === 'admin' || u.role === 'super_admin')) {
          await notificationService.notify({
            userId: a.id, title: `Cron task failing: ${taskId}`,
            body: `Task ${taskId} failed ${failures} consecutive times. Last error: ${message.slice(0, 300)}`,
            type: 'system',
          });
        }
      } catch { /* alerting best effort */ }
    }
    setRequestId(null);
    return NextResponse.json({ success: false, error: { code: 'TASK_FAILED', message } }, { status: 500 });
  }
}
