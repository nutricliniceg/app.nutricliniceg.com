import { userRepository } from '@/lib/db/repositories/users.repo';
import { subscriptionPlansRepository } from '@/lib/db/repositories/subscription-plans.repo';
import { billingRepository } from '@/lib/db/repositories/billing.repo';
import { notifyPagedAdmins } from '@/lib/notifications/admin-alerts';
import { sendEmail } from '@/lib/email/mailer';
import { fail } from '@/lib/plans';
import { createIntention, getPaymobConfig, verifyPaymobHmac } from './paymob';
import { lifecycleState, graceUntil, bannerFor, GRACE_DAYS } from './lifecycle';
import { resolveBrand } from '@/lib/print/branding';
import { mintFileToken } from '@/lib/files/signed-url';

function daysFromNow(days: number, from = Date.now()): Date {
  return new Date(from + days * 86400000);
}

async function notifyAdmins(title: string, body: string): Promise<void> {
  await notifyPagedAdmins({ title, body });
}

// Extend (or create) a live subscription from a duration in days.
async function activateSubscription(userId: string, planId: string, durationDays: number, method: 'paymob' | 'manual' | 'bank_transfer', reference: string | null): Promise<string> {
  const latest = await billingRepository.latestForUser(userId);
  const base = latest && new Date(latest.ends_at).getTime() > Date.now() ? new Date(latest.ends_at).getTime() : Date.now();
  const endsAt = new Date(base + durationDays * 86400000);
  const id = await billingRepository.insertSubscription({
    userId, planId, status: 'active', paymentMethod: method, paymentReference: reference, endsAt,
  });
  await userRepository.update(userId, { subscription_plan_id: planId, subscription_ends_at: endsAt });
  await userRepository.update(userId, { is_active: true });
  return id;
}

export const billingService = {
  async publicPlans() {
    const plans = await subscriptionPlansRepository.listAll();
    return plans.filter((p) => p.is_active === true || p.is_active === 1);
  },

  async checkout(userId: string, planId: string, method: 'paymob' | 'manual') {
    const user = await userRepository.findById(userId);
    if (!user) throw fail('NOT_FOUND', 'User not found');
    const plan = await subscriptionPlansRepository.findById(planId);
    if (!plan || !(plan.is_active === true || plan.is_active === 1)) throw fail('NOT_FOUND', 'Plan not available');
    if (method === 'manual') {
      return { method: 'manual' as const, plan_id: planId, instructions: 'manual' as const };
    }
    const amountCents = Math.round(Number(plan.price_monthly) * 100);
    const intention = await createIntention({
      planId, userId, userEmail: user.email, userName: user.name,
      amountCents, currency: 'EGP',
    });
    return { method: 'paymob' as const, plan_id: planId, payment_url: intention.paymentUrl };
  },

  async submitManual(userId: string, planId: string, method: 'manual' | 'bank_transfer', reference: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw fail('NOT_FOUND', 'User not found');
    const plan = await subscriptionPlansRepository.findById(planId);
    if (!plan) throw fail('NOT_FOUND', 'Plan not found');
    const id = await billingRepository.insertManualRequest({ userId, planId, method, reference: reference.trim() });
    await notifyAdmins('New manual payment request', `${user.name} (${user.email}) submitted a ${method} payment ref ${reference.trim()}`);
    return { id };
  },

  // R13 + idempotent webhook. Returns prior result on replays.
  async handlePaymobWebhook(raw: Record<string, unknown>): Promise<{ subscriptionId: string | null; replayed: boolean }> {
    const hmac = typeof raw.hmac === 'string' ? raw.hmac : '';
    const obj = (raw.obj ?? raw.transaction ?? {}) as Record<string, unknown>;
    const txnId = String(obj.id ?? '');
    if (!txnId || !hmac) throw fail('BAD_WEBHOOK', 'Missing transaction payload');
    const config = await getPaymobConfig();
    if (!config.hmacSecret) throw fail('BILLING_NOT_CONFIGURED', 'Webhook secret not configured');
    if (!verifyPaymobHmac(obj, hmac, config.hmacSecret)) throw fail('BAD_SIGNATURE', 'Webhook signature mismatch');
    const existing = await billingRepository.findPaymobTxn(txnId);
    if (existing) {
      const subs = await billingRepository.subscriptionsForUser(existing.user_id);
      return { subscriptionId: subs[0]?.id ?? null, replayed: true };
    }
    const extra = ((obj.payment_key_claims ?? {}) as Record<string, unknown>).extra as Record<string, unknown> | undefined;
    const userId = typeof extra?.user_id === 'string' ? extra.user_id : null;
    const planId = typeof extra?.plan_id === 'string' ? extra.plan_id : null;
    const success = obj.success === true;
    const user = userId ? await userRepository.findById(userId) : null;
    if (!userId || !user) throw fail('BAD_WEBHOOK', 'Unknown user for transaction');
    await billingRepository.insertPaymobTxn({
      userId, planId, paymobTransactionId: txnId,
      amountCents: Number(obj.amount_cents ?? 0), currency: String(obj.currency ?? 'EGP'),
      success, rawPayload: raw,
    });
    if (!success) return { subscriptionId: null, replayed: false };
    const plan = planId ? await subscriptionPlansRepository.findById(planId) : null;
    const duration = plan ? Number(plan.duration_days) : 30;
    const subscriptionId = await activateSubscription(userId, planId ?? '', duration, 'paymob', txnId);
    try {
      await sendEmail({
        to: user.email,
        subject: 'NutriClinicEG: payment received — welcome',
        text: `Hello ${user.name}, your payment succeeded and your account is active. Sign in with the password you registered with (or reset it if needed).`,
        html: `<p>Hello ${user.name}, your payment succeeded and your account is <strong>active</strong>. Sign in with your registered password.</p>`,
      });
    } catch {
      // Best-effort.
    }
    await notifyAdmins('Paymob payment auto-activated', `${user.name} (${user.email}) activated via Paymob txn ${txnId}`);
    return { subscriptionId, replayed: false };
  },

  async reviewManual(adminId: string, requestId: string, approve: boolean, reason: string | null) {
    const req = await billingRepository.findManualRequest(requestId);
    if (!req || req.status !== 'pending') throw fail('NOT_FOUND', 'Pending request not found');
    await billingRepository.reviewManualRequest(requestId, approve ? 'approved' : 'rejected', adminId, reason);
    const user = await userRepository.findById(req.user_id);
    if (approve) {
      const plan = await subscriptionPlansRepository.findById(req.plan_id);
      const subscriptionId = await activateSubscription(req.user_id, req.plan_id, plan ? Number(plan.duration_days) : 30, req.method, req.reference);
      if (user) {
        try {
          await sendEmail({
            to: user.email, subject: 'NutriClinicEG: payment approved',
            text: `Hello ${user.name}, your manual payment was approved and your account is active.`,
            html: `<p>Hello ${user.name}, your manual payment was <strong>approved</strong>.</p>`,
          });
        } catch {
          // Best-effort.
        }
      }
      return { subscriptionId };
    }
    if (user && reason) {
      try {
        await sendEmail({
          to: user.email, subject: 'NutriClinicEG: payment review',
          text: `Hello ${user.name}, your manual payment was not approved. Reason: ${reason}`,
          html: `<p>Hello ${user.name}, your manual payment was <strong>not approved</strong>.</p><p>Reason: ${reason}</p>`,
        });
      } catch {
        // Best-effort.
      }
    }
    return { subscriptionId: null };
  },

  async grantTrial(adminId: string, userId: string, days = 14): Promise<{ subscriptionId: string }> {
    void adminId;
    const user = await userRepository.findById(userId);
    if (!user) throw fail('NOT_FOUND', 'User not found');
    const plans = await subscriptionPlansRepository.listAll();
    const planId = String(user.subscription_plan_id ?? plans[0]?.id ?? '');
    if (!planId) throw fail('NO_PLANS', 'No subscription plan exists to grant trial on');
    const subscriptionId = await activateSubscription(userId, planId, days, 'manual', 'trial-grant');
    try {
      await sendEmail({
        to: user.email, subject: `NutriClinicEG: ${days}-day trial`,
        text: `Hello ${user.name}, a ${days}-day trial was granted to your account.`,
        html: `<p>Hello ${user.name}, a <strong>${days}-day trial</strong> was granted.</p>`,
      });
    } catch {
      // Best-effort.
    }
    return { subscriptionId };
  },

  async status(userId: string) {
    const latest = await billingRepository.latestForUser(userId);
    if (!latest) return { state: 'none' as const, banner: 'none' as const, ends_at: null, grace_until: null };
    const state = lifecycleState({ status: latest.status, endsAt: latest.ends_at }, new Date());
    return {
      state,
      banner: bannerFor(state),
      ends_at: latest.ends_at,
      grace_until: state === 'grace' ? graceUntil(latest.ends_at) : null,
      grace_days: GRACE_DAYS,
    };
  },

  async receipt(subscriptionId: string, requesterId: string, isAdmin: boolean) {
    const subs = await billingRepository.subscriptionsForUser(requesterId);
    let sub = subs.find((s) => s.id === subscriptionId) ?? null;
    if (!sub && isAdmin) {
      sub = await billingRepository.findSubscriptionById(subscriptionId);
    }
    if (!sub) throw fail('NOT_FOUND', 'Receipt not found');
    const user = await userRepository.findById(sub.user_id);
    const plan = await subscriptionPlansRepository.findById(sub.plan_id);
    const doctor = user ? { name: user.name, clinic_name: user.clinic_name, clinic_logo_url: user.clinic_logo_url } : { name: '', clinic_name: null, clinic_logo_url: null };
    const ownerId = sub.user_id;
    return {
      subscription: sub,
      user: user ? { name: user.name, email: user.email } : null,
      plan: plan ? { name_en: plan.name_en, name_ar: plan.name_ar, price_monthly: Number(plan.price_monthly) } : null,
      brand: resolveBrand(doctor, (fileId) => `/api/files/${fileId}?token=${mintFileToken(fileId, ownerId)}`),
      // Tax e-invoicing is OUT of scope (open question Q4): receipts are
      // commercial confirmations, not tax invoices.
      tax_note: 'Not a tax invoice (Q4 pending)',
    };
  },
};
