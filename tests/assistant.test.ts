import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assistantService } from '@/lib/assistant/assistant.service';
import { assembleContext } from '@/lib/assistant/context';
import { deidentify } from '@/lib/security/deidentify';
import { MEDICAL_DISCLAIMER } from '@/lib/ai/disclaimer';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { aiConversationsRepository } from '@/lib/db/repositories/ai-conversations.repo';
import { getAiClientForDoctor } from '@/lib/ai/client';

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: { findById: vi.fn(), setConsentAiSharing: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/lib/db/repositories/visits.repo', () => ({
  visitsRepository: { listByPatient: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/self-reports.repo', () => ({
  selfReportsRepository: { insert: vi.fn(), listByPatient: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/plans.repo', () => ({
  plansRepository: { listByPatient: vi.fn().mockResolvedValue([]), getFullPlan: vi.fn() },
  planRevisionsRepository: { nextRevisionNo: vi.fn(), insert: vi.fn(), listByPlan: vi.fn(), getByNo: vi.fn() },
  planGenerationsRepository: { insert: vi.fn(), findByPlan: vi.fn() },
}));

vi.mock('@/lib/db/repositories/exercises.repo', () => ({
  exercisesRepository: { listByPatient: vi.fn().mockResolvedValue([]), getFullPlan: vi.fn() },
}));

vi.mock('@/lib/db/repositories/lab-drafts.repo', () => ({
  labDraftsRepository: { listApprovedByPatient: vi.fn().mockResolvedValue([]), listDraftsByPatient: vi.fn() },
}));

vi.mock('@/lib/db/repositories/files.repo', () => ({
  filesRepository: { findById: vi.fn(), listByPatient: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/ai-conversations.repo', () => ({
  aiConversationsRepository: {
    insert: vi.fn().mockResolvedValue('conv-1'), findOwned: vi.fn(),
    list: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined), restore: vi.fn().mockResolvedValue(undefined),
    insertMessage: vi.fn().mockResolvedValue('msg-1'), listMessages: vi.fn().mockResolvedValue([]),
    lastSystemMessage: vi.fn(),
  },
}));

vi.mock('@/lib/ai/client', () => ({
  getAiClient: vi.fn(),
  getAiClientForDoctor: vi.fn(),
}));

vi.mock('@/lib/files/store', () => ({
  readBuffer: vi.fn().mockResolvedValue(Buffer.from('bytes')),
}));

type Mock = ReturnType<typeof vi.fn>;

const diabetic = {
  id: 'pat1', doctor_id: 'doc1', gender: 'female' as const,
  birth_date: new Date('1980-05-05'), height_cm: 160,
  initial_weight_kg: 85, current_weight_kg: 85,
  activity_level: 'sedentary' as const, goal: 'lose' as const,
  chronic_conditions: ['diabetes'], allergies: ['peanut'],
  name_ar: 'Samira Hassan', name_en: 'Samira Hassan', medical_notes: null,
  consent_ai_sharing_at: new Date('2026-09-01'),
};

beforeEach(() => { vi.clearAllMocks(); });

describe('P21 context assembly (AI-21/22)', () => {
  it('loads diabetic context with metrics and zero PII', async () => {
    (patientRepository.findById as Mock).mockResolvedValue(diabetic);
    const ctx = await assembleContext('doc1', 'pat1');
    expect(ctx.facts.conditions).toContain('diabetes');
    expect(ctx.facts.bmi).toBeGreaterThan(0);
    expect(ctx.systemBlock).toContain('diabetes');
    expect(ctx.systemBlock).not.toContain('Samira');
    expect(ctx.systemBlock).not.toContain('Hassan');
    expect(ctx.secrets).toContain('Samira Hassan');
  });
});

describe('P21 scrubber (CMP-11)', () => {
  it('removes names, emails, and phone runs', () => {
    const out = deidentify('Patient Samira Hassan, mail samira@x.com, call 01012345678, id 29901011234567', ['Samira Hassan']);
    expect(out).not.toContain('Samira');
    expect(out).not.toContain('samira@x.com');
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
    expect(out).toContain('[national-id]');
  });
});

describe('P21 consent gate (AI-25)', () => {
  it('blocks context send without consent, captures inline', async () => {
    (aiConversationsRepository.findOwned as Mock).mockResolvedValue({ id: 'c1', patient_id: 'pat1', title: null, deleted_at: null });
    (patientRepository.findById as Mock).mockResolvedValue({ ...diabetic, consent_ai_sharing_at: null });
    (getAiClientForDoctor as Mock).mockResolvedValue({ chat: vi.fn(), vision: vi.fn() });
    await expect(assistantService.send('doc1', false, 'c1', { content: 'hi' })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    await assistantService.captureConsent('doc1', 'pat1');
    expect(patientRepository.setConsentAiSharing as Mock).toHaveBeenCalledWith('pat1', 'doc1');
  });
});

describe('P21 trash lifecycle (AI-17/18)', () => {
  it('soft-deletes and restores within 30 days, expires after', async () => {
    (aiConversationsRepository.findOwned as Mock).mockResolvedValue({ id: 'c1', deleted_at: null });
    await assistantService.remove('doc1', 'c1');
    expect(aiConversationsRepository.softDelete as Mock).toHaveBeenCalledWith('c1', 'doc1');
    (aiConversationsRepository.findOwned as Mock).mockResolvedValue({ id: 'c1', deleted_at: new Date() });
    await assistantService.restore('doc1', 'c1');
    expect(aiConversationsRepository.restore as Mock).toHaveBeenCalledWith('c1', 'doc1');
    (aiConversationsRepository.findOwned as Mock).mockResolvedValue({ id: 'c1', deleted_at: new Date(Date.now() - 31 * 86400000) });
    await expect(assistantService.restore('doc1', 'c1')).rejects.toMatchObject({ code: 'TRASH_EXPIRED' });
  });
});

describe('P21 disclaimer + send (AI-14)', () => {
  it('returns disclaimer on every AI response and persists history', async () => {
    (aiConversationsRepository.findOwned as Mock).mockResolvedValue({ id: 'c1', patient_id: 'pat1', title: null, deleted_at: null });
    (patientRepository.findById as Mock).mockResolvedValue(diabetic);
    (getAiClientForDoctor as Mock).mockResolvedValue({ chat: vi.fn().mockResolvedValue({ text: 'Eat balanced meals' }), vision: vi.fn() });
    const result = await assistantService.send('doc1', false, 'c1', { content: 'What should I eat?' });
    expect(result.disclaimer).toBe(MEDICAL_DISCLAIMER);
    expect(result.reply).toContain('Eat balanced meals');
    const roles = (aiConversationsRepository.insertMessage as Mock).mock.calls.map((c) => c[1]);
    expect(roles).toEqual(['system', 'user', 'assistant']);
  });
});

describe('P21 change-patient warning (AI-26/27)', () => {
  it('requires confirmation over existing history', async () => {
    (aiConversationsRepository.findOwned as Mock).mockResolvedValue({ id: 'c1', patient_id: 'old', deleted_at: null });
    (patientRepository.findById as Mock).mockResolvedValue({ ...diabetic, id: 'pat1' });
    (aiConversationsRepository.listMessages as Mock).mockResolvedValue([{ role: 'user', content: 'hi' }]);
    await expect(assistantService.linkPatient('doc1', 'c1', 'pat1')).rejects.toMatchObject({ code: 'NEEDS_CONFIRMATION' });
    await assistantService.linkPatient('doc1', 'c1', 'pat1', true);
    expect(aiConversationsRepository.update as Mock).toHaveBeenCalledWith('c1', 'doc1', { patientId: 'pat1' });
  });
});
