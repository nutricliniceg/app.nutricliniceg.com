import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planWeeksService } from '@/lib/plans/plan-weeks.service';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { plansRepository, planRevisionsRepository } from '@/lib/db/repositories/plans.repo';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/db/repositories/visits.repo', () => ({
  visitsRepository: { listByPatient: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/foods.repo', () => ({
  foodsRepository: {
    findByIds: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    listCandidates: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/db/repositories/plans.repo', () => ({
  plansRepository: {
    findById: vi.fn(),
    findOwnedById: vi.fn(),
    updatePlanTargets: vi.fn().mockResolvedValue(undefined),
    updateReconciled: vi.fn().mockResolvedValue(undefined),
    updateMealItemValues: vi.fn().mockResolvedValue(undefined),
    insertPlan: vi.fn().mockResolvedValue(undefined),
    insertMeal: vi.fn().mockResolvedValue(undefined),
    insertMealItem: vi.fn().mockResolvedValue(undefined),
    listByPatient: vi.fn().mockResolvedValue([]),
    getFullPlan: vi.fn(),
  },
  planRevisionsRepository: {
    nextRevisionNo: vi.fn().mockResolvedValue(1),
    insert: vi.fn().mockResolvedValue(undefined),
    listByPlan: vi.fn().mockResolvedValue([]),
    getByNo: vi.fn(),
  },
  planGenerationsRepository: { insert: vi.fn(), findByPlan: vi.fn() },
}));

type Mock = ReturnType<typeof vi.fn>;

const patient = {
  id: 'pat1', doctor_id: 'doc1', gender: 'female' as const,
  birth_date: new Date('1990-01-01'), height_cm: 165,
  initial_weight_kg: 80, current_weight_kg: 80,
  activity_level: 'moderate' as const, goal: 'maintain' as const,
  chronic_conditions: null, allergies: null,
};

function nutritionFull() {
  return {
    plan: { id: 'p1', patient_id: 'pat1', doctor_id: 'doc1', status: 'pending_doctor_approval' },
    meals: [{
      meal: { id: 'm1', plan_id: 'p1', day_of_week: 1, meal_name: 'Breakfast', culinary_pairings_valid: 1 },
      items: [{
        id: 'i1', meal_id: 'm1', food_id: null, food_name_ar: 'شوفان', food_name_en: 'Oats',
        source: 'db', grams: 100, protein_g: 10, carbs_g: 60, fats_g: 5, calories: 350,
      }],
    }],
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('QATE plan-weeks split: adaptiveRecompute', () => {
  it('recomputes targets from the latest visit weight and revises', async () => {
    (plansRepository.findOwnedById as Mock).mockResolvedValue({ id: 'p1', patient_id: 'pat1', status: 'pending_doctor_approval' });
    (patientRepository.findById as Mock).mockResolvedValue(patient);
    (visitsRepository.listByPatient as Mock).mockResolvedValue([
      { id: 'v1', weight_kg: 70, visit_date: '2026-09-01' },
      { id: 'v0', weight_kg: null, visit_date: '2026-09-10' },
    ]);
    (plansRepository.getFullPlan as Mock).mockResolvedValue(nutritionFull());
    const result = await planWeeksService.adaptiveRecompute('p1', 'doc1');
    expect(result?.weightUsedKg).toBe(70);
    expect(plansRepository.updatePlanTargets as Mock).toHaveBeenCalledWith('p1', 'doc1', expect.objectContaining({ targetCalories: expect.any(Number) }));
    expect(planRevisionsRepository.insert as Mock).toHaveBeenCalledWith(expect.objectContaining({ changeNote: expect.stringContaining('70 kg') }));
  });

  it('blocks archived plans and returns null for foreign plans', async () => {
    (plansRepository.findOwnedById as Mock).mockResolvedValue({ id: 'p1', status: 'archived' });
    await expect(planWeeksService.adaptiveRecompute('p1', 'doc1')).rejects.toMatchObject({ code: 'ARCHIVED' });
    (plansRepository.findOwnedById as Mock).mockResolvedValue(null);
    await expect(planWeeksService.adaptiveRecompute('nope', 'doc1')).resolves.toBeNull();
  });
});

describe('QATE plan-weeks split: cloneWeek', () => {
  it('clones into max+1 week with revision lineage', async () => {
    (plansRepository.findOwnedById as Mock).mockResolvedValue({
      id: 'p1', patient_id: 'pat1', week_number: 2, generation_mode: 'from_list',
      target_calories: 1400, target_protein_g: 80, target_carbs_g: 150, target_fats_g: 45,
    });
    (plansRepository.listByPatient as Mock).mockResolvedValue([{ week_number: 1 }, { week_number: 2 }]);
    (plansRepository.getFullPlan as Mock).mockResolvedValue(nutritionFull());
    const result = await planWeeksService.cloneWeek('p1', 'doc1', null);
    expect(result?.weekNumber).toBe(3);
    expect(plansRepository.insertPlan as Mock).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', weekNumber: 3 }));
    expect(planRevisionsRepository.insert as Mock).toHaveBeenCalledWith(expect.objectContaining({ revisionNo: 1 }));
  });
});
