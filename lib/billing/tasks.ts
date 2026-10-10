import { userRepository } from '@/lib/db/repositories/users.repo';
import { billingRepository } from '@/lib/db/repositories/billing.repo';
import { notificationService } from '@/lib/notifications/service';
import { notifyPagedAdmins } from '@/lib/notifications/admin-alerts';
import { sendEmail } from '@/lib/email/mailer';
import { lifecycleState, detectMismatches } from './lifecycle';

async function notifyAdmins(title: string, body: string): Promise<void> {
  await notifyPagedAdmins({ title, body });
}

// Cron-task bodies (P29 registers the endpoints). Split from
// billing.service.ts (file-health gate); behavior identical.
export const billingTasks = {
  // CRON-01 expire (daily 02:00).
  async expireTask(now = new Date()): Promise<{ transitioned: Array<{ id: string; from: string; to: string }> }> {
    const candidates = await billingRepository.expiringCandidates(now);
    const transitioned: Array<{ id: string; from: string; to: string }> = [];
    for (const sub of candidates) {
      const next = lifecycleState({ status: sub.status, endsAt: sub.ends_at }, now);
      if (next !== sub.status && (next === 'grace' || next === 'expired')) {
        await billingRepository.updateSubscription(sub.id, { status: next });
        transitioned.push({ id: sub.id, from: sub.status, to: next });
        if (next === 'expired') {
          // R16 false-positive protection: every deactivation pages admins.
          await notifyAdmins('Subscription expired', `User ${sub.user_id} plan ${sub.plan_id} expired after grace. Manual re-activation available from Admin → Users.`);
        }
      }
    }
    return { transitioned };
  },

  // CRON-03/04/05 reminders 7/3/0 days (idempotent via sent-flags).
  async reminderTask(kind: 7 | 3 | 0, now = new Date()): Promise<{ sent: number }> {
    const candidates = await billingRepository.reminderCandidates(kind, now);
    const col = kind === 7 ? 'reminder_7d_sent' : kind === 3 ? 'reminder_3d_sent' : 'reminder_0d_sent';
    let sent = 0;
    for (const sub of candidates) {
      const user = await userRepository.findById(sub.user_id);
      if (!user) continue;
      const text = `Your NutriClinicEG subscription ends on ${new Date(sub.ends_at).toLocaleDateString()} (${kind} days). Renew to avoid interruption.`;
      try {
        await sendEmail({ to: user.email, subject: 'NutriClinicEG: subscription ending soon', text, html: `<p>${text}</p>` });
        await notificationService.notify({ userId: user.id, title: 'Subscription ending soon', body: text, type: 'subscription' });
        await billingRepository.markReminder(sub.id, col);
        sent += 1;
      } catch {
        // Next run retries (flag unset = idempotent).
      }
    }
    return { sent };
  },

  // CRON-13 daily reconciliation.
  async reconcileTask(): Promise<{ mismatches: ReturnType<typeof detectMismatches> }> {
    const txns = await billingRepository.successfulTxns();
    const userIds = [...new Set(txns.map((t) => t.user_id))];
    const subs: Array<{ user_id: string; plan_id: string; status: 'trial' | 'active' | 'grace' | 'expired' | 'cancelled' | 'pending_payment'; ends_at: Date }> = [];
    for (const uid of userIds) {
      for (const s of await billingRepository.subscriptionsForUser(uid)) {
        subs.push({ user_id: s.user_id, plan_id: s.plan_id, status: s.status, ends_at: new Date(s.ends_at) });
      }
    }
    const mismatches = detectMismatches(
      txns.map((t) => ({ user_id: t.user_id, plan_id: t.plan_id, amount_cents: t.amount_cents, success: t.success === true || t.success === 1 })),
      subs
    );
    if (mismatches.length > 0) {
      await notifyAdmins('Billing reconciliation alert', `${mismatches.length} paid-but-not-extended case(s) need review.`);
    }
    return { mismatches };
  },
};
