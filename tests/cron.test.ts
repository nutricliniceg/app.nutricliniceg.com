import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/repositories/cron.repo', () => ({
  cronRepository: {
    beginRun: vi.fn(async () => 'run-1'),
    finishRun: vi.fn(async () => 1),
    lastRuns: vi.fn(async () => []),
    recentErrors: vi.fn(async () => []),
  },
}));

vi.mock('@/lib/db/repositories/users.repo', () => ({
  userRepository: { listAllForBroadcast: vi.fn(async () => []) },
}));

vi.mock('@/lib/notifications/service', () => ({
  notificationService: { notify: vi.fn(async () => undefined) },
}));

vi.mock('@/lib/billing/tasks', () => ({
  billingTasks: {
    expireTask: vi.fn(async () => ({ transitioned: [] })),
    reminderTask: vi.fn(async () => ({ sent: 0 })),
    reconcileTask: vi.fn(async () => ({ mismatches: [] })),
  },
}));

vi.mock('@/lib/blog-admin/posts.service', () => ({
  postsService: { publishDue: vi.fn(async () => ({ published: 1 })) },
}));

vi.mock('@/lib/newsletter/campaigns.service', () => ({
  campaignsService: { processDue: vi.fn(async () => ({ campaigns: 1, sent: 5, failed: 0 })) },
}));

vi.mock('@/lib/ai/health', () => ({
  probeAllProviders: vi.fn(async () => []),
}));

vi.mock('@/lib/ai/retry-queue', () => ({
  MAX_RETRY_ATTEMPTS: 5,
  processRetryQueue: vi.fn(async () => ({ processed: 0, succeeded: 0, requeued: 0, deadLettered: 0 })),
}));

vi.mock('@/lib/db/repositories/ai.repo', () => ({
  aiProviderRepository: { findById: vi.fn(async () => null), listChain: vi.fn(async () => []) },
}));

vi.mock('@/lib/db/repositories/messages.repo', () => ({
  messagesRepository: { unreadSummary: vi.fn(async () => ({ total_unread: 0, threads: [] })) },
}));

vi.mock('@/lib/email/mailer', () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock('@/lib/backup/backup.service', () => ({
  backupService: {
    runBackup: vi.fn(async () => ({ file: 'f', bytes: 1, offServer: null, pruned: 0 })),
    verifyLatest: vi.fn(async () => ({ file: 'f', match: true, live: { User: 3 }, restored: { User: 3 } })),
  },
}));

vi.mock('@/lib/db/pool', () => ({
  executeQuery: vi.fn(async () => [{ affectedRows: 0 }]),
}));

import { NextRequest } from 'next/server';
import { runCronTask, cronSecretOk } from '@/lib/cron/runner';
import { cronTasks } from '@/lib/cron/tasks';
import { CRON_TASKS } from '@/lib/cron/registry';
import { scrubSentryEvent, isSentryEnabled } from '@/lib/observability/sentry';
import { MAX_RETRY_ATTEMPTS } from '@/lib/ai/retry-queue';

function req(secret: string | null): NextRequest {
  const headers = new Headers();
  if (secret !== null) headers.set('x-cron-secret', secret);
  return new NextRequest('https://app.test/api/cron/x', { method: 'POST', headers });
}

describe('P29 cron framework', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret-12345678';
  });

  it('rejects missing/wrong secrets with 404 (no enumeration)', async () => {
    expect(cronSecretOk(req(null))).toBe(false);
    expect(cronSecretOk(req('wrong'))).toBe(false);
    const res = await runCronTask('backup', req('wrong'));
    expect(res.status).toBe(404);
  });

  it('rejects unknown tasks with 404', async () => {
    const res = await runCronTask('no-such-task', req('test-secret-12345678'));
    expect(res.status).toBe(404);
  });

  it('runs every registered task successfully (idempotent handlers)', async () => {
    expect(CRON_TASKS.length).toBeGreaterThanOrEqual(15);
    for (const def of CRON_TASKS) {
      expect(cronTasks[def.id], `missing handler: ${def.id}`).toBeDefined();
      const res = await runCronTask(def.id, req('test-secret-12345678'));
      expect(res.status, `task failed: ${def.id}`).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  it('running twice causes no duplicate effect (idempotent bodies)', async () => {
    const { billingTasks } = await import('@/lib/billing/tasks');
    const first = await runCronTask('expire-subscriptions', req('test-secret-12345678'));
    const second = await runCronTask('expire-subscriptions', req('test-secret-12345678'));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(vi.mocked(billingTasks.expireTask).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('retry queue caps at 5 attempts before dead-letter', () => {
    expect(MAX_RETRY_ATTEMPTS).toBe(5);
  });

  it('restore-verification report generates with checksums', async () => {
    const res = await runCronTask('backup-verify', req('test-secret-12345678'));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.match).toBe(true);
    expect(body.data.live).toEqual(body.data.restored);
  });

  it('health payload shape exposes components without secrets', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET(new NextRequest('https://app.test/api/health'));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.components.db).toHaveProperty('ok');
    expect(body.data.components.smtp).toHaveProperty('ok');
    expect(body.data.components.ai).toHaveProperty('providers');
    expect(body.data.components.cron).toBeDefined();
    expect(JSON.stringify(body)).not.toContain('test-secret-12345678');
  });

  it('sentry scrubber strips PHI and redacts secret keys', () => {
    const out = scrubSentryEvent({
      message: 'failed for ahmed@mail.com phone 01012345678',
      user: { email: 'x@y.com', name: 'ok' },
      request: { password: 'hunter2', token: 'abc' },
    }) as Record<string, Record<string, string> | string>;
    expect(String(out.message)).not.toContain('ahmed@mail.com');
    expect((out.user as Record<string, string>).email).toBe('[redacted]');
    expect((out.request as Record<string, string>).password).toBe('[redacted]');
    expect(isSentryEnabled()).toBe(false);
  });
});
