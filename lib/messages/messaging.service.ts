import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { filesRepository } from '@/lib/db/repositories/files.repo';
import { messagesRepository, type PortalMessageRow } from '@/lib/db/repositories/messages.repo';
import { portalTokensRepository } from '@/lib/db/repositories/portal-tokens.repo';
import { notificationService } from '@/lib/notifications/service';
import { sendEmail } from '@/lib/email/mailer';
import { mintFileToken } from '@/lib/files/signed-url';
import { fail } from '@/lib/plans';
import { PORTAL_INVALID } from '@/lib/portal';
import { parsePermissions, hasPermission } from '@/lib/portal/permissions';
import type { ThreadReplyInput } from './messaging.schema';

// 5-minute sender delete window (MSG-07).
export const DELETE_WINDOW_MS = 5 * 60 * 1000;

function invalid(): Error {
  return fail(PORTAL_INVALID, 'This link is invalid or has expired');
}

function safePayload(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// `file:<id>` refs → fresh signed URLs; external https passes through.
function resolveAttachment(url: string | null, ownerId: string): string | null {
  if (!url) return null;
  if (url.startsWith('file:')) {
    const fileId = url.slice('file:'.length);
    if (!fileId) return null;
    return `/api/files/${fileId}?token=${mintFileToken(fileId, ownerId)}`;
  }
  return url.startsWith('https://') ? url : null;
}

export interface ThreadMessageView {
  id: string;
  sender: 'patient' | 'doctor';
  type: string;
  text: string | null;
  attachmentUrl: string | null;
  payload: unknown;
  createdAt: Date;
}

function toView(row: PortalMessageRow, ownerId: string): ThreadMessageView {
  return {
    id: row.id,
    sender: row.sender_type,
    type: row.message_type,
    text: row.message_text,
    attachmentUrl: resolveAttachment(row.attachment_url, ownerId),
    payload: safePayload(row.payload_json),
    createdAt: row.created_at,
  };
}

async function assertImageFile(fileId: string, doctorId: string, patientId: string): Promise<void> {
  const file = await filesRepository.findById(fileId);
  if (!file || file.owner_id !== doctorId) throw fail('NOT_FOUND', 'Attachment not found');
  if (!file.mime.startsWith('image/')) throw fail('INVALID_ATTACHMENT', 'Only images can be attached to messages');
  const linkedPatient = (file as { patient_id?: string | null }).patient_id;
  if (linkedPatient && linkedPatient !== patientId) throw fail('NOT_FOUND', 'Attachment not found');
}

async function emailPatientReply(doctorId: string, patientId: string, patientName: string, text: string | null): Promise<void> {
  // Patient has no account (PP-13) and no stored address: replies email the
  // address captured at link generation, when present. Otherwise skipped.
  try {
    const to = await portalTokensRepository.findNotifyEmail(patientId, doctorId);
    if (!to) return;
    const doctor = await userRepository.findById(doctorId);
    await sendEmail({
      to,
      subject: `NutriClinicEG: reply from ${doctor?.name ?? 'your doctor'}`,
      text: `Reply regarding ${patientName}: ${text ?? '(image)'}`,
      html: `<p>Reply regarding <strong>${patientName}</strong>:</p><p>${text ?? '(image)'}</p>`,
    });
  } catch {
    // Reply notification is a side-channel; never fails the send.
  }
}

export const messagingService = {
  // ---- doctor side ----
  async listThreads(doctorId: string, includeArchived = false) {
    const rows = await messagesRepository.listThreads(doctorId, includeArchived);
    return rows.map((r) => ({
      patient_id: r.patient_id,
      patient_name: r.patient_name,
      last_message_at: r.last_message_at,
      last_preview: r.last_preview,
      last_sender: r.last_sender,
      unread_count: Number(r.unread_count),
      total_count: Number(r.total_count),
    }));
  },

  async getThread(doctorId: string, patientId: string) {
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Thread not found');
    const rows = await messagesRepository.listThread(patientId, doctorId, 200);
    return {
      patient: { id: patient.id, name_ar: (patient as { name_ar: string }).name_ar },
      messages: rows.map((r) => toView(r, doctorId)),
    };
  },

  async reply(doctorId: string, patientId: string, input: ThreadReplyInput): Promise<{ id: string }> {
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Thread not found');
    const text = input.text?.trim() || null;
    let attachment: string | null = null;
    if (input.file_id) {
      await assertImageFile(input.file_id, doctorId, patientId);
      attachment = `file:${input.file_id}`;
    }
    const id = await messagesRepository.insert({
      patientId, doctorId, senderType: 'doctor',
      messageType: attachment ? 'image' : 'text',
      messageText: text, attachmentUrl: attachment,
      payload: attachment ? { file_id: input.file_id } : null,
    });
    await emailPatientReply(doctorId, patientId, (patient as { name_ar: string }).name_ar, text);
    return { id };
  },

  async markRead(doctorId: string, patientId: string): Promise<void> {
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Thread not found');
    await messagesRepository.markThreadRead(patientId, doctorId);
  },

  async setArchived(doctorId: string, patientId: string, archived: boolean): Promise<void> {
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Thread not found');
    await messagesRepository.setThreadArchived(patientId, doctorId, archived);
  },

  async deleteMessage(doctorId: string, messageId: string, now = Date.now()): Promise<void> {
    const row = await messagesRepository.findById(messageId);
    if (!row || row.doctor_id !== doctorId || row.sender_type !== 'doctor') throw fail('NOT_FOUND', 'Message not found');
    if (now - new Date(row.created_at).getTime() > DELETE_WINDOW_MS) throw fail('DELETE_WINDOW_EXPIRED', 'Messages can only be deleted within 5 minutes of sending');
    await messagesRepository.deleteById(messageId);
  },

  async unreadSummary(doctorId: string) {
    return messagesRepository.unreadSummary(doctorId);
  },

  // CRON-06 hook: the P29 digest job calls this to build the daily email.
  async digestSnapshot(doctorId: string) {
    return messagingService.unreadSummary(doctorId);
  },

  // ---- patient side (token) ----
  async portalThread(token: string) {
    const row = await portalTokensRepository.findByToken(token);
    if (!row) throw invalid();
    const revoked = row.revoked === true || row.revoked === 1;
    if (revoked || new Date(row.expires_at).getTime() <= Date.now()) throw invalid();
    const perms = parsePermissions(JSON.parse(String(row.permissions)));
    if (!hasPermission(perms, 'message')) throw fail('PERMISSION_DENIED', 'Messaging is not enabled for this link');
    await portalTokensRepository.touchAccess(row.id);
    const rows = await messagesRepository.listThread(row.patient_id, row.doctor_id, 200);
    return { permissions: perms, messages: rows.map((r) => toView(r, row.doctor_id)) };
  },

  async portalDelete(token: string, messageId: string, now = Date.now()): Promise<void> {
    const row = await portalTokensRepository.findByToken(token);
    if (!row) throw invalid();
    const revoked = row.revoked === true || row.revoked === 1;
    if (revoked || new Date(row.expires_at).getTime() <= Date.now()) throw invalid();
    const msg = await messagesRepository.findById(messageId);
    if (!msg || msg.patient_id !== row.patient_id || msg.sender_type !== 'patient') throw fail('NOT_FOUND', 'Message not found');
    if (now - new Date(msg.created_at).getTime() > DELETE_WINDOW_MS) throw fail('DELETE_WINDOW_EXPIRED', 'Messages can only be deleted within 5 minutes of sending');
    await messagesRepository.deleteById(messageId);
  },
};
