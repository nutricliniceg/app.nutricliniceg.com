import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as portalAlias } from '@/app/p/[token]/route';
import { portalService, PORTAL_INVALID } from '@/lib/portal/portal.service';
import { parsePermissions } from '@/lib/portal/permissions';
import { portalTokensRepository } from '@/lib/db/repositories/portal-tokens.repo';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { plansRepository } from '@/lib/db/repositories/plans.repo';
import { exercisesRepository } from '@/lib/db/repositories/exercises.repo';
import { messagesRepository } from '@/lib/db/repositories/messages.repo';
import { notificationService } from '@/lib/notifications/service';
import { sendEmail } from '@/lib/email/mailer';

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));

vi.mock('@/lib/db/repositories/portal-tokens.repo', () => ({
  portalTokensRepository: {
    insert: vi.fn(), findByToken: vi.fn(), listByPatient: vi.fn(),
    revoke: vi.fn(), touchAccess: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/db/repositories/users.repo', () => ({
  userRepository: { findById: vi.fn(), update: vi.fn() },
}));

vi.mock('@/lib/db/repositories/plans.repo', () => ({
  plansRepository: { listByPatient: vi.fn().mockResolvedValue([]), getFullPlan: vi.fn() },
  planRevisionsRepository: { nextRevisionNo: vi.fn(), insert: vi.fn(), listByPlan: vi.fn(), getByNo: vi.fn() },
  planGenerationsRepository: { insert: vi.fn(), findByPlan: vi.fn() },
}));

vi.mock('@/lib/db/repositories/exercises.repo', () => ({
  exercisesRepository: { listByPatient: vi.fn().mockResolvedValue([]), getFullPlan: vi.fn() },
}));

vi.mock('@/lib/db/repositories/messages.repo', () => ({
  messagesRepository: { insert: vi.fn().mockResolvedValue('msg-1'), listThread: vi.fn() },
}));

vi.mock('@/lib/db/repositories/self-reports.repo', () => ({
  selfReportsRepository: { insert: vi.fn().mockResolvedValue('sr-1'), listByPatient: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/files.repo', () => ({
  filesRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/notifications/service', () => ({
  notificationService: { notify: vi.fn().mockResolvedValue(undefined), getUnreadCount: vi.fn() },
}));

vi.mock('@/lib/email/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

type Mock = ReturnType<typeof vi.fn>;

const perms = { view_plans: true, send_weight: true, send_note: true, message: true };

function tokenRow(overrides = {}) {
  return {
    id: 'tok-1', patient_id: 'pat1', doctor_id: 'doc1', token: '11111111-1111-4111-8111-111111111111',
    permissions: JSON.stringify(perms),
    expires_at: new Date(Date.now() + 86400000), revoked: false,
    access_count: 0, last_accessed_at: null, created_at: new Date(),
    ...overrides,
  };
}

const patient = { id: 'pat1', doctor_id: 'doc1', name_ar: 'مريض' };

beforeEach(() => { vi.clearAllMocks(); });

describe('P19 generic token errors (PP-10)', () => {
  it('wrong, expired, and revoked tokens share one code', async () => {
    (portalTokensRepository.findByToken as Mock).mockResolvedValue(null);
    await expect(portalService.context('bad')).rejects.toMatchObject({ code: PORTAL_INVALID });
    (portalTokensRepository.findByToken as Mock).mockResolvedValue(tokenRow({ expires_at: new Date(Date.now() - 1000) }));
    await expect(portalService.context('old')).rejects.toMatchObject({ code: PORTAL_INVALID });
    (portalTokensRepository.findByToken as Mock).mockResolvedValue(tokenRow({ revoked: true }));
    await expect(portalService.context('rev')).rejects.toMatchObject({ code: PORTAL_INVALID });
    (portalTokensRepository.findByToken as Mock).mockResolvedValue(tokenRow({ revoked: 1 }));
    await expect(portalService.submitWeight('rev', 70, null)).rejects.toMatchObject({ code: PORTAL_INVALID });
  });

  it('bumps access counters on every open (PP-08)', async () => {
    (portalTokensRepository.findByToken as Mock).mockResolvedValue(tokenRow());
    (patientRepository.findById as Mock).mockResolvedValue(patient);
    await portalService.context('tok');
    expect(portalTokensRepository.touchAccess as Mock).toHaveBeenCalledWith('tok-1');
  });
});

describe('P19 permission gates (PP-02)', () => {
  it('blocks message API without permission and hides plans', async () => {
    const limited = tokenRow({ permissions: JSON.stringify({ ...perms, message: false, view_plans: false }) });
    (portalTokensRepository.findByToken as Mock).mockResolvedValue(limited);
    (patientRepository.findById as Mock).mockResolvedValue(patient);
    await expect(portalService.sendMessage('tok', 'hi')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(messagesRepository.insert as Mock).not.toHaveBeenCalled();
    const ctx = await portalService.context('tok');
    expect(ctx.nutrition).toBeNull();
    expect(ctx.exercise).toBeNull();
    expect(ctx.permissions.message).toBe(false);
  });

  it('parses stored permission JSON defensively', () => {
    expect(parsePermissions(null)).toMatchObject(perms);
    expect(parsePermissions({ message: false }).message).toBe(false);
  });
});

describe('P19 short alias 301 (D-04)', () => {
  it('redirects /p/[token] to /portal/[token] with 301', async () => {
    const token = '11111111-1111-4111-8111-111111111111';
    const res = await portalAlias(new NextRequest(`http://localhost/p/${token}`), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`http://localhost/portal/${token}`);
  });
});

describe('P19 submissions land in the patient file', () => {
  it('weight_log message + doctor notified, patient row untouched', async () => {
    (portalTokensRepository.findByToken as Mock).mockResolvedValue(tokenRow());
    (patientRepository.findById as Mock).mockResolvedValue(patient);
    (userRepository.findById as Mock).mockResolvedValue({ email: 'doc@x.com' });
    const result = await portalService.submitWeight('tok', 72.5, null);
    expect(result).toEqual({ id: 'msg-1' });
    expect(messagesRepository.insert as Mock).toHaveBeenCalledWith(expect.objectContaining({
      messageType: 'weight_log', senderType: 'patient',
      payload: expect.objectContaining({ weight_kg: 72.5 }),
    }));
    expect(notificationService.notify as Mock).toHaveBeenCalledWith(expect.objectContaining({ userId: 'doc1' }));
    expect(sendEmail as Mock).toHaveBeenCalled();
  });

  it('email failure never fails the submission', async () => {
    (portalTokensRepository.findByToken as Mock).mockResolvedValue(tokenRow());
    (patientRepository.findById as Mock).mockResolvedValue(patient);
    (userRepository.findById as Mock).mockResolvedValue({ email: 'doc@x.com' });
    (sendEmail as Mock).mockRejectedValue(new Error('smtp down'));
    await expect(portalService.submitNote('tok', 'hello')).resolves.toEqual({ id: 'msg-1' });
  });
});
