import { describe, it, expect, vi, beforeEach } from 'vitest';
import { labService } from '@/lib/labs/lab.service';
import { labDraftsRepository } from '@/lib/db/repositories/lab-drafts.repo';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { scrubPhi } from '@/lib/errors/errors.service';

vi.mock('@/lib/db/repositories/lab-drafts.repo', () => ({
  labDraftsRepository: {
    insert: vi.fn(),
    findById: vi.fn(),
    listDraftsByPatient: vi.fn(),
    listApprovedByPatient: vi.fn(),
    review: vi.fn(),
  },
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: { findById: vi.fn() },
}));

const patient = { id: 'p1', doctor_id: 'doc1' };
type Mock = ReturnType<typeof vi.fn>;

describe('lab analyzer approval gate (D-18)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves text extraction as DRAFT, never official', async () => {
    (patientRepository.findById as unknown as Mock).mockResolvedValue(patient);
    const res = await labService.analyze('doc1', { patient_id: 'p1', text: 'HbA1c: 6.5 %\nVitamin D: 18 ng/mL' });
    expect(res?.source).toBe('text');
    expect(res?.items).toEqual([
      { name: 'HbA1c', value: 6.5, unit: '%' },
      { name: 'Vitamin D', value: 18, unit: 'ng/mL' },
    ]);
    expect(labDraftsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'p1', doctorId: 'doc1', source: 'text' })
    );
    expect(labDraftsRepository.review).not.toHaveBeenCalled();
  });

  it('returns null for foreign patients', async () => {
    (patientRepository.findById as unknown as Mock).mockResolvedValue({ ...patient, doctor_id: 'other' });
    expect(await labService.analyze('doc1', { patient_id: 'p1', text: 'HbA1c: 6.5' })).toBeNull();
  });

  it('approve/discard flows through the review gate', async () => {
    (labDraftsRepository.review as unknown as Mock).mockResolvedValue(true);
    expect(await labService.review('d1', 'doc1', 'approved')).toBe(true);
    expect(await labService.review('d1', 'doc1', 'discarded')).toBe(true);
    expect(labDraftsRepository.review).toHaveBeenCalledWith('d1', 'doc1', 'approved', 'doc1');
  });
});

describe('client error PHI scrub (OBS-05)', () => {
  it('strips emails, phones, and national IDs', () => {
    const out = scrubPhi('user ahmed@mail.com phone 01012345678 id 29901011234567 failed');
    expect(out).not.toContain('ahmed@mail.com');
    expect(out).not.toContain('01012345678');
    expect(out).not.toContain('29901011234567');
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
    expect(out).toContain('[national-id]');
  });
});
