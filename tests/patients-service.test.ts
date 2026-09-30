import { describe, it, expect, vi, beforeEach } from 'vitest';
import { patientsService } from '@/lib/patients/patients.service';
import { patientRepository } from '@/lib/db/repositories/patients.repo';

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: {
    findById: vi.fn(),
    findByDoctor: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateWeight: vi.fn(),
    getStats: vi.fn(),
    getWeeklyActivity: vi.fn(),
  },
}));

vi.mock('@/lib/db/repositories/visits.repo', () => ({
  visitsRepository: {
    insert: vi.fn(),
    findById: vi.fn(),
    listByPatient: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@/lib/db/repositories/lab-drafts.repo', () => ({
  labDraftsRepository: {
    insert: vi.fn(),
    findById: vi.fn(),
    listDraftsByPatient: vi.fn().mockResolvedValue([]),
    listApprovedByPatient: vi.fn().mockResolvedValue([]),
    review: vi.fn(),
  },
}));

vi.mock('@/lib/db/repositories/self-reports.repo', () => ({
  selfReportsRepository: {
    insert: vi.fn(),
    listByPatient: vi.fn().mockResolvedValue([]),
  },
}));

const basePatient = {
  id: 'p1',
  doctor_id: 'doc1',
  name_ar: 'Test',
  name_en: null,
  gender: 'female' as const,
  birth_date: new Date('1990-01-01'),
  height_cm: 150,
  initial_weight_kg: 40,
  current_weight_kg: null,
  activity_level: 'sedentary' as const,
  goal: 'lose' as const,
  medical_notes: null,
  chronic_conditions: null,
  allergies: null,
  consent_ai_sharing_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('patientsService P09 acceptance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clamps low target to 1200 for female (DASH-09)', async () => {
    (patientRepository.findById as any).mockResolvedValue({ ...basePatient });
    const result = await patientsService.getWithNutrition('p1', 'doc1');
    expect(result?.nutrition.targetCalories).toBe(1200);
    expect(result?.nutrition.safetyClamped).toBe(true);
    expect(result?.nutrition.safetyWarning).toContain('1200');
  });

  it('flags doctor review for diabetes patient', async () => {
    (patientRepository.findById as any).mockResolvedValue({
      ...basePatient,
      chronic_conditions: ['diabetes'],
    });
    const result = await patientsService.getWithNutrition('p1', 'doc1');
    expect(result?.nutrition.doctorReviewRequired).toBe(true);
  });

  it('returns null for foreign doctor (generic 404 guard)', async () => {
    (patientRepository.findById as any).mockResolvedValue({ ...basePatient, doctor_id: 'other' });
    expect(await patientsService.getWithNutrition('p1', 'doc1')).toBeNull();
    expect(await patientsService.update('p1', 'doc1', { goal: 'gain' })).toBe(false);
    expect(await patientsService.remove('p1', 'doc1')).toBeNull();
    expect(await patientsService.recalculate('p1', 'doc1', {})).toBeNull();
  });

  it('dashboardStats merges counts with weekly activity', async () => {
    (patientRepository.getStats as any).mockResolvedValue({ total: 5, visitsThisWeek: 2, activePlans: 3 });
    (patientRepository.getWeeklyActivity as any).mockResolvedValue([{ day: '09-19', visits: 1, plans: 0 }]);
    const stats = await patientsService.dashboardStats('doc1');
    expect(stats.total).toBe(5);
    expect(stats.weekly).toHaveLength(1);
  });
});
