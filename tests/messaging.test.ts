import { describe, it, expect, vi, beforeEach } from 'vitest';
import { messagingService, DELETE_WINDOW_MS } from '@/lib/messages/messaging.service';
import { messagesRepository } from '@/lib/db/repositories/messages.repo';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { filesRepository } from '@/lib/db/repositories/files.repo';
import { portalTokensRepository } from '@/lib/db/repositories/portal-tokens.repo';
import { notificationService } from '@/lib/notifications/service';
import { sendEmail } from '@/lib/email/mailer';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));

vi.mock('@/lib/db/repositories/messages.repo', () => ({
  messagesRepository: {
    insert: vi.fn().mockResolvedValue('msg-1'), listThread: vi.fn().mockResolvedValue([]),
    findById: vi.fn(), listThreads: vi.fn().mockResolvedValue([]),
    unreadSummary: vi.fn(), markThreadRead: vi.fn().mockResolvedValue(undefined),
    deleteById: vi.fn().mockResolvedValue(undefined),
    setThreadArchived: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/db/repositories/users.repo', () => ({
  userRepository: { findById: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/db/repositories/files.repo', () => ({
  filesRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/db/repositories/portal-tokens.repo', () => ({
  portalTokensRepository: {
    insert: vi.fn(), findByToken: vi.fn(), listByPatient: vi.fn(),
    revoke: vi.fn(), touchAccess: vi.fn(), updateNotifyEmail: vi.fn(),
    findNotifyEmail: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/lib/notifications/service', () => ({
  notificationService: { notify: vi.fn().mockResolvedValue(undefined), getUnreadCount: vi.fn() },
}));

vi.mock('@/lib/email/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

type Mock = ReturnType<typeof vi.fn>;

const patient = { id: 'pat1', doctor_id: 'doc1', name_ar: 'مريض' };
const perms = { view_plans: true, send_weight: true, send_note: true, message: true };

function liveToken(overrides = {}) {
  return {
    id: 'tok-1', patient_id: 'pat1', doctor_id: 'doc1', token: 't',
    permissions: JSON.stringify(perms), expires_at: new Date(Date.now() + 86400000),
    revoked: false, access_count: 0, last_accessed_at: null, created_at: new Date(), ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('P20 unread counts + summary', () => {
  it('returns cheap counts with latest preview', async () => {
    (messagesRepository.unreadSummary as Mock).mockResolvedValue({
      total_unread: 3,
      threads: [{ patient_id: 'pat1', unread_count: 3, last_preview: 'وزني اليوم' }],
    });
    const out = await messagingService.unreadSummary('doc1');
    expect(out.total_unread).toBe(3);
    expect(out.threads[0].last_preview).toBe('وزني اليوم');
    const digest = await messagingService.digestSnapshot('doc1');
    expect(digest.total_unread).toBe(3);
  });

  it('marks threads read and toggles archive', async () => {
    (patientRepository.findById as Mock).mockResolvedValue(patient);
    await messagingService.markRead('doc1', 'pat1');
    expect(messagesRepository.markThreadRead as Mock).toHaveBeenCalledWith('pat1', 'doc1');
    await messagingService.setArchived('doc1', 'pat1', true);
    expect(messagesRepository.setThreadArchived as Mock).toHaveBeenCalledWith('pat1', 'doc1', true);
    (patientRepository.findById as Mock).mockResolvedValue({ ...patient, doctor_id: 'other' });
    await expect(messagingService.markRead('doc1', 'pat1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('P20 5-minute delete window', () => {
  const fresh = { id: 'm1', patient_id: 'pat1', doctor_id: 'doc1', sender_type: 'doctor', created_at: new Date() };
  it('allows own-message delete inside the window, blocks after', async () => {
    (messagesRepository.findById as Mock).mockResolvedValue(fresh);
    await messagingService.deleteMessage('doc1', 'm1', Date.now());
    expect(messagesRepository.deleteById as Mock).toHaveBeenCalledWith('m1');
    (messagesRepository.findById as Mock).mockResolvedValue({ ...fresh, created_at: new Date(Date.now() - DELETE_WINDOW_MS - 1000) });
    await expect(messagingService.deleteMessage('doc1', 'm1', Date.now())).rejects.toMatchObject({ code: 'DELETE_WINDOW_EXPIRED' });
  });

  it('blocks deleting others’ messages', async () => {
    (messagesRepository.findById as Mock).mockResolvedValue({ ...fresh, sender_type: 'patient' });
    await expect(messagingService.deleteMessage('doc1', 'm1', Date.now())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    (messagesRepository.findById as Mock).mockResolvedValue(null);
    await expect(messagingService.deleteMessage('doc1', 'ghost', Date.now())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('patient portal delete honors the same boundary', async () => {
    (portalTokensRepository.findByToken as Mock).mockResolvedValue(liveToken());
    (messagesRepository.findById as Mock).mockResolvedValue({ id: 'm2', patient_id: 'pat1', sender_type: 'patient', created_at: new Date() });
    await messagingService.portalDelete('t', 'm2', Date.now());
    (messagesRepository.findById as Mock).mockResolvedValue({ id: 'm2', patient_id: 'pat1', sender_type: 'patient', created_at: new Date(Date.now() - DELETE_WINDOW_MS - 1000) });
    await expect(messagingService.portalDelete('t', 'm2', Date.now())).rejects.toMatchObject({ code: 'DELETE_WINDOW_EXPIRED' });
  });
});

describe('P20 structured payload round-trip + reply email', () => {
  it('weight payloads survive JSON and replies email notify_email', async () => {
    (patientRepository.findById as Mock).mockResolvedValue(patient);
    (portalTokensRepository.findNotifyEmail as Mock).mockResolvedValue('mom@example.com');
    (userRepository.findById as Mock).mockResolvedValue({ name: 'Dr A' });
    const payload = { weight_kg: 72.5, measured_at: new Date().toISOString() };
    (messagesRepository.listThread as Mock).mockResolvedValue([{
      id: 'm1', sender_type: 'patient', message_type: 'weight_log', message_text: null,
      attachment_url: null, payload_json: JSON.stringify(payload), created_at: new Date(),
    }]);
    const thread = await messagingService.getThread('doc1', 'pat1');
    expect(thread.messages[0].payload).toEqual(payload);
    await messagingService.reply('doc1', 'pat1', { text: 'Keep going' });
    expect(sendEmail as Mock).toHaveBeenCalledWith(expect.objectContaining({ to: 'mom@example.com' }));
  });

  it('reply without notify_email skips email silently', async () => {
    (patientRepository.findById as Mock).mockResolvedValue(patient);
    (portalTokensRepository.findNotifyEmail as Mock).mockResolvedValue(null);
    await messagingService.reply('doc1', 'pat1', { text: 'ok' });
    expect(sendEmail as Mock).not.toHaveBeenCalled();
  });

  it('rejects non-image attachments', async () => {
    (patientRepository.findById as Mock).mockResolvedValue(patient);
    (filesRepository.findById as Mock).mockResolvedValue({ id: 'f1', owner_id: 'doc1', mime: 'application/pdf' });
    await expect(messagingService.reply('doc1', 'pat1', { text: null, file_id: 'f1' })).rejects.toMatchObject({ code: 'INVALID_ATTACHMENT' });
  });
});

describe('P20 portal rate limit (20/hour)', () => {
  it('allows 20 writes then throttles the 21st', async () => {
    const key = `qgate-${Date.now()}`;
    for (let i = 0; i < 20; i++) {
      const r = await checkRateLimit(key, RATE_LIMITS.portalWrite);
      expect(r.allowed).toBe(true);
    }
    const over = await checkRateLimit(key, RATE_LIMITS.portalWrite);
    expect(over.allowed).toBe(false);
  });
});
