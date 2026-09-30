import { createHash } from 'crypto';
import { subscribersRepository } from '@/lib/db/repositories/subscribers.repo';
import { sendEmail } from '@/lib/email/mailer';
import { fail } from '@/lib/plans';
import { baseUrl } from '@/lib/blog/seo';
import { newToken, confirmExpired, parseSubscriberCsv, subscribersToCsv } from './tokens-csv';
import type { SubscribeInput } from './newsletter.schema';

export { parseSubscriberCsv, subscribersToCsv };

// The single neutral message for every duplicate/error path (NL-08).
export const NEUTRAL_MESSAGE = 'تحقق من بريدك للتأكيد | Check your email to confirm';

function ipHash(ip: string): string {
  return createHash('sha256')
    .update(ip + (process.env.AUDIT_IP_SALT || 'default-salt-change-in-production'))
    .digest('hex');
}

function confirmUrl(token: string): string {
  return `${baseUrl()}/newsletter/confirm/${token}`;
}

function unsubUrl(token: string): string {
  return `${baseUrl()}/newsletter/unsubscribe/${token}`;
}

async function sendConfirmEmail(to: string, locale: string, name: string | null, confirmToken: string, unsubToken: string): Promise<void> {
  const ar = locale !== 'en';
  const subject = ar ? 'أكّد اشتراكك في نشرة NutriClinicEG' : 'Confirm your NutriClinicEG subscription';
  const body = ar
    ? `مرحبًا ${name ?? ''}،\nأكّد اشتراكك: ${confirmUrl(confirmToken)}\n(الرابط صالح 48 ساعة ولمرة واحدة)\nإلغاء الاشتراك: ${unsubUrl(unsubToken)}`
    : `Hello ${name ?? ''},\nConfirm your subscription: ${confirmUrl(confirmToken)}\n(Link valid 48h, single use)\nUnsubscribe: ${unsubUrl(unsubToken)}`;
  await sendEmail({ to, subject, text: body, html: `<p>${body.replace(/\n/g, '<br>')}</p>` });
}

// Suppression gate for EVERY send path (NL-06): only confirmed rows may
// ever receive. P28's campaign engine calls this before each batch.
export async function isSuppressed(email: string): Promise<boolean> {
  const row = await subscribersRepository.findByEmail(email);
  return !row || row.status !== 'confirmed';
}

export const newsletterService = {
  async subscribe(input: SubscribeInput, ip: string): Promise<{ message: string }> {
    // Honeypot filled → pretend success, store nothing (NL-04).
    if (input.website && input.website.trim() !== '') return { message: NEUTRAL_MESSAGE };
    const email = input.email.trim().toLowerCase();
    const existing = await subscribersRepository.findByEmail(email);
    if (existing) {
      if (existing.status === 'pending') {
        // Re-send the confirmation (still neutral externally).
        const token = newToken();
        await subscribersRepository.refreshConfirmToken(existing.id, token);
        try {
          await sendConfirmEmail(email, existing.locale, existing.name, token, existing.unsub_token);
        } catch {
          // Email failure stays silent per NL-08.
        }
      }
      // confirmed / unsubscribed / bounced → silently neutralized (NL-06/08).
      return { message: NEUTRAL_MESSAGE };
    }
    const confirmToken = newToken();
    const unsubToken = newToken();
    await subscribersRepository.insert({
      email, name: input.name?.trim() || null, locale: input.locale ?? 'ar',
      source: input.source ?? 'footer', confirmToken,
      unsubToken, ipHash: ipHash(ip),
    });
    try {
      await sendConfirmEmail(email, input.locale ?? 'ar', input.name?.trim() || null, confirmToken, unsubToken);
    } catch {
      // Silent per NL-08.
    }
    return { message: NEUTRAL_MESSAGE };
  },

  async confirm(token: string): Promise<{ ok: boolean }> {
    const row = await subscribersRepository.findByConfirmToken(token);
    // Single generic outcome for wrong/used/expired (no enumeration).
    if (!row || row.status !== 'pending') return { ok: false };
    if (confirmExpired(row.created_at)) return { ok: false };
    await subscribersRepository.confirm(row.id);
    return { ok: true };
  },

  async unsubscribe(token: string): Promise<{ ok: boolean }> {
    const row = await subscribersRepository.findByUnsubToken(token);
    if (!row) return { ok: false };
    // Immediate, idempotent, no login (NL-05).
    await subscribersRepository.unsubscribe(row.id);
    return { ok: true };
  },

  async adminAdd(email: string, name: string | null, locale: string): Promise<{ id: string }> {
    const existing = await subscribersRepository.findByEmail(email.trim().toLowerCase());
    if (existing) throw fail('DUPLICATE_SUBSCRIBER', 'Subscriber already exists');
    const id = await subscribersRepository.insert({
      email: email.trim().toLowerCase(), name, locale,
      source: 'manual', confirmToken: newToken(), unsubToken: newToken(), ipHash: null,
    });
    return { id };
  },

  async hardDelete(id: string): Promise<void> {
    const done = await subscribersRepository.hardDelete(id);
    if (!done) throw fail('NOT_FOUND', 'Subscriber not found');
  },

  async importCsv(text: string): Promise<{ imported: number; skipped: number }> {
    const rows = parseSubscriberCsv(text);
    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      const existing = await subscribersRepository.findByEmail(row.email);
      // Suppressed or existing rows are NEVER resurrected by import (NL-06).
      if (existing) {
        skipped += 1;
        continue;
      }
      await subscribersRepository.insert({
        email: row.email, name: row.name, locale: row.locale,
        source: 'import', confirmToken: newToken(), unsubToken: newToken(), ipHash: null,
      });
      imported += 1;
    }
    return { imported, skipped };
  },
};
