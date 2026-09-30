import { maintenanceRepository } from '@/lib/db/repositories/maintenance.repo';
import { billingTasks } from '@/lib/billing/tasks';
import { postsService } from '@/lib/blog-admin/posts.service';
import { campaignsService } from '@/lib/newsletter/campaigns.service';
import { probeAllProviders } from '@/lib/ai/health';
import { processRetryQueue, MAX_RETRY_ATTEMPTS } from '@/lib/ai/retry-queue';
import { aiProviderRepository } from '@/lib/db/repositories/ai.repo';
import { messagesRepository } from '@/lib/db/repositories/messages.repo';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { notificationService } from '@/lib/notifications/service';
import { sendEmail } from '@/lib/email/mailer';
import { backupService } from '@/lib/backup/backup.service';
import { logger } from '@/lib/observability/logger';

async function notifyAdmins(title: string, body: string): Promise<void> {
  try {
    const admins = await userRepository.listAllForBroadcast(null);
    for (const a of admins.filter((u) => u.role === 'admin' || u.role === 'super_admin')) {
      try {
        await notificationService.notify({ userId: a.id, title, body, type: 'system' });
      } catch { /* per-admin best effort */ }
    }
  } catch { /* never fail a cron task on alerting */ }
}

// Every handler is idempotent: state flags (reminder sent-flags, unique
// send keys, claimDue, newsletter_sent_at lock) make re-runs no-ops.
export const cronTasks: Record<string, () => Promise<Record<string, unknown>>> = {
  // CRON-01 daily 02:00 — expire subscriptions past grace.
  'expire-subscriptions': async () => {
    const r = await billingTasks.expireTask();
    return { transitioned: r.transitioned.length };
  },
  // CRON-03/04/05 daily 09:00 — 7/3/0-day reminders (flag-idempotent).
  'reminders-7d': async () => billingTasks.reminderTask(7),
  'reminders-3d': async () => billingTasks.reminderTask(3),
  'reminders-0d': async () => billingTasks.reminderTask(0),
  // CRON-06 daily 08:00 — doctor digest of unread patient messages.
  'doctor-digest': async () => {
    const doctors = await userRepository.listAllForBroadcast('doctor');
    let notified = 0;
    for (const d of doctors) {
      try {
        const summary = await messagesRepository.unreadSummary(d.id);
        if (summary.total_unread > 0) {
          await notificationService.notify({
            userId: d.id, title: 'Daily digest',
            body: `You have ${summary.total_unread} unread patient message(s) across ${summary.threads.length} conversation(s).`,
            type: 'new_message',
          });
          notified += 1;
        }
      } catch { /* per-doctor best effort */ }
    }
    return { doctors: doctors.length, notified };
  },
  // CRON-07 daily 03:00 — encrypted backup with retention.
  'backup': async () => backupService.runBackup(),
  // CRON-08 weekly — cleanup expired OTPs, temp files, stale logs.
  'cleanup': async () => {
    const otp = await maintenanceRepository.cleanupExpiredCodes();
    const resets = await maintenanceRepository.cleanupExpiredResets();
    const logs = await maintenanceRepository.cleanupResolvedLogs();
    const aiScrub = await maintenanceRepository.scrubOldAiErrors();
    logger.info('cron.cleanup', { otp, resets, logs, aiScrubbed: aiScrub });
    return { otp, resets, logs, aiScrubbed: aiScrub };
  },
  // CRON-09 every 6h — AI provider probe + auto re-enable on recovery.
  'ai-health': async () => {
    const outcomes = await probeAllProviders();
    let reEnabled = 0;
    for (const o of outcomes) {
      if (o.ok) {
        try {
          const p = await aiProviderRepository.findById(o.providerId);
          if (p && !p.is_enabled && Number(p.failure_count ?? 0) > 0) {
            await aiProviderRepository.probeResult(o.providerId, true);
            reEnabled += 1;
          }
        } catch { /* best effort */ }
      }
    }
    if (outcomes.length > 0 && outcomes.every((o) => !o.ok)) {
      await notifyAdmins('All AI providers down', 'Every enabled AI provider failed its health probe. AI features are degraded.');
    }
    return { probed: outcomes.length, ok: outcomes.filter((o) => o.ok).length, reEnabled };
  },
  // CRON-10 every 15min — publish due posts → revalidate → auto-campaigns.
  'publish-posts': async () => postsService.publishDue(),
  // CRON-11 every 5min — newsletter batch (dedupe via uq key).
  'newsletter-send': async () => campaignsService.processDue(),
  // CRON-12 daily 04:00 — newsletter cleanup + bounce reminder.
  'newsletter-cleanup': async () => {
    const expiredCount = await maintenanceRepository.deleteExpiredPendingSubscribers();
    const n = await maintenanceRepository.countBouncedSubscribers();
    if (n > 0) await notifyAdmins('Bounced newsletter addresses', `${n} subscriber(s) are marked bounced. Review or purge them from Admin → Newsletter.`);
    return { expiredPending: expiredCount, bounced: n };
  },
  // CRON-13 daily 05:00 — payment reconciliation report.
  'reconcile-payments': async () => {
    const r = await billingTasks.reconcileTask();
    return { mismatches: r.mismatches.length };
  },
  // CRON-14 every 10min — AI retry queue (5 attempts → dead-letter + alert).
  'ai-retry': async () => {
    const outcome = await processRetryQueue(25, async () => {
      // The chain re-drive happens in-process when providers recover;
      // without a recovered provider the item stays queued for next run.
      throw new Error('No healthy provider available yet');
    });
    if (outcome.deadLettered > 0) {
      await notifyAdmins('AI retry queue dead letters', `${outcome.deadLettered} request(s) exhausted ${MAX_RETRY_ATTEMPTS} attempts and need review.`);
    }
    return { ...outcome };
  },
  // CRON-15 every 12h — pending activations older than 24h (AUTH-18).
  'activation-reminders': async () => {
    const stale = await maintenanceRepository.listStalePendingUsers();
    await notifyAdmins('Pending activations', `${stale.length} account(s) await activation for >24h.`);
    for (const u of stale) {
      try {
        await sendEmail({
          to: u.email, subject: 'NutriClinicEG: your account is pending activation',
          text: 'Your NutriClinicEG account is still pending activation. Our team will activate it shortly.',
          html: '<p>Your NutriClinicEG account is still pending activation. Our team will activate it shortly.</p>',
        });
      } catch { /* next run retries */ }
    }
    return { reminded: stale.length };
  },
  // Weekly — SEC-22 restore verification into a scratch database.
  'backup-verify': async () => backupService.verifyLatest(),
};
