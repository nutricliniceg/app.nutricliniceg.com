import { userRepository } from '@/lib/db/repositories/users.repo';
import { adminMessagesRepository } from '@/lib/db/repositories/admin-messages.repo';
import { notificationService } from '@/lib/notifications/service';
import { sendEmail } from '@/lib/email/mailer';
import { fail } from '@/lib/plans';

export interface BulkEmailInput {
  senderId: string;
  alias: 'no-reply' | 'info' | 'admin';
  audience: 'all' | 'doctors' | 'selected' | 'admins';
  userIds?: string[];
  subject: string;
  body: string;
  viaEmail?: boolean;
  viaInApp?: boolean;
}

function brandedHtml(subject: string, body: string): string {
  const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  return `<div style="font-family:Arial,sans-serif;max-width:600px"><h2>${subject}</h2><div>${escaped}</div><hr><p style="color:#888">NutriClinicEG — nutricliniceg.com</p></div>`;
}

async function sendTo(
  messageId: string,
  recipientId: string,
  user: { id: string; email: string },
  input: Pick<BulkEmailInput, 'alias' | 'subject' | 'body' | 'viaEmail' | 'viaInApp'>
): Promise<boolean> {
  const viaEmail = input.viaEmail ?? true;
  const viaInApp = input.viaInApp ?? true;
  if (viaInApp) {
    try {
      await notificationService.notify({ userId: user.id, title: input.subject, body: input.body.slice(0, 500), type: 'system' });
    } catch {
      // In-app is best-effort; the email leg carries the tracked status.
    }
  }
  if (!viaEmail) {
    await adminMessagesRepository.markSent(recipientId, true);
    return true;
  }
  try {
    await sendEmail({ to: user.email, subject: input.subject, text: input.body, html: brandedHtml(input.subject, input.body), fromAlias: input.alias });
    await adminMessagesRepository.markSent(recipientId, true);
    return true;
  } catch (err) {
    await adminMessagesRepository.markSent(recipientId, false, err instanceof Error ? err.message.slice(0, 1000) : 'Send failed');
    return false;
  }
}

export const bulkEmailService = {
  // ADM-18: composer → recipient fan-out (tracked rows) → per-recipient
  // send with status tracking. P05 limiter (mailer 300/h) applies.
  async compose(input: BulkEmailInput): Promise<{ messageId: string; recipients: number; sent: number; failed: number }> {
    let users: Array<{ id: string; email: string; name: string; role: string }>;
    if (input.audience === 'selected') {
      users = [];
      for (const id of input.userIds ?? []) {
        const u = await userRepository.findById(id);
        if (u) users.push({ id: u.id, email: u.email, name: u.name, role: u.role });
      }
    } else {
      users = await userRepository.listAllForBroadcast(
        input.audience === 'doctors' ? 'doctor' : input.audience === 'admins' ? 'admin' : null
      );
    }
    if (users.length === 0) throw fail('NO_RECIPIENTS', 'No recipients for this audience');
    const messageId = await adminMessagesRepository.insert({
      senderId: input.senderId, senderAlias: input.alias, recipientType: input.audience,
      subject: input.subject, body: input.body,
      sendViaEmail: input.viaEmail ?? true, sendViaInApp: input.viaInApp ?? true,
    });
    await adminMessagesRepository.addRecipients(messageId, users.map((u) => u.id));
    const rows = await adminMessagesRepository.listRecipients(messageId);
    const byUser = new Map(rows.map((r) => [r.user_id, r.id]));
    let sent = 0;
    let failed = 0;
    for (const u of users) {
      const recipientId = byUser.get(u.id);
      if (!recipientId) continue;
      if (await sendTo(messageId, recipientId, u, input)) sent += 1;
      else failed += 1;
    }
    await adminMessagesRepository.updateCounts(messageId);
    return { messageId, recipients: users.length, sent, failed };
  },

  async retry(messageId: string): Promise<{ retried: number; sent: number; failed: number }> {
    const failedRows = await adminMessagesRepository.listFailed(messageId);
    let sent = 0;
    let failed = 0;
    // Re-resolve users for failed rows (message header carries subject/body).
    const header = await adminMessagesRepository.findById(messageId);
    if (!header) throw fail('NOT_FOUND', 'Message not found');
    for (const row of failedRows) {
      const u = await userRepository.findById(row.user_id);
      if (!u) {
        await adminMessagesRepository.markSent(row.id, false, 'User no longer exists');
        failed += 1;
        continue;
      }
      try {
        await sendEmail({
          to: u.email, subject: header.subject, text: header.body,
          html: brandedHtml(header.subject, header.body), fromAlias: header.sender_alias as 'no-reply' | 'info' | 'admin',
        });
        await adminMessagesRepository.markSent(row.id, true);
        sent += 1;
      } catch (err) {
        await adminMessagesRepository.markSent(row.id, false, err instanceof Error ? err.message.slice(0, 1000) : 'Send failed');
        failed += 1;
      }
    }
    await adminMessagesRepository.updateCounts(messageId);
    return { retried: failedRows.length, sent, failed };
  },
};
