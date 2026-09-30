import { describe, it, expect, vi, beforeEach } from 'vitest';
import { visitsService } from '@/lib/visits/visits.service';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';
import { patientRepository } from '@/lib/db/repositories/patients.repo';

vi.mock('@/lib/db/repositories/visits.repo', () => ({
  visitsRepository: {
    insert: vi.fn(),
    findById: vi.fn(),
    listByPatient: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: {
    findById: vi.fn(),
    updateWeight: vi.fn(),
  },
}));

const patient = {
  id: 'p1',
  doctor_id: 'doc1',
  gender: 'female' as const,
  birth_date: new Date('1990-01-01'),
  height_cm: 165,
  initial_weight_kg: 70,
  current_weight_kg: null,
  activity_level: 'moderate' as const,
  goal: 'maintain' as const,
  chronic_conditions: null,
  allergies: null,
};

describe('visitsService (DASH-10)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a visit, updates weight, and suggests recalculated targets', async () => {
    (patientRepository.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ...patient });
    const res = await visitsService.create('doc1', { patient_id: 'p1', visit_date: '2026-09-20', weight_kg: 68 });
    expect(res).not.toBeNull();
    expect(patientRepository.updateWeight).toHaveBeenCalledWith('p1', 'doc1', 68);
    expect(res?.recalcSuggested?.targetCalories).toBeGreaterThan(0);
    expect(res?.recalcSuggested?.safetyClamped).toBe(false);
  });

  it('returns null for a foreign patient (generic 404)', async () => {
    (patientRepository.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ...patient, doctor_id: 'other' });
    expect(await visitsService.create('doc1', { patient_id: 'p1', visit_date: '2026-09-20' })).toBeNull();
    expect(await visitsService.list('p1', 'doc1')).toBeNull();
  });

  it('lists visits for an owned patient', async () => {
    (patientRepository.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ...patient });
    (visitsRepository.listByPatient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'v1' }]);
    expect(await visitsService.list('p1', 'doc1')).toEqual([{ id: 'v1' }]);
  });

  it('clamps recalc suggestion at the safety floor', async () => {
    (patientRepository.findById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...patient,
      initial_weight_kg: 40,
      height_cm: 150,
      activity_level: 'sedentary',
      goal: 'lose',
    });
    const res = await visitsService.create('doc1', { patient_id: 'p1', visit_date: '2026-09-20' });
    expect(res?.recalcSuggested?.targetCalories).toBe(1200);
    expect(res?.recalcSuggested?.safetyClamped).toBe(true);
  });
});
