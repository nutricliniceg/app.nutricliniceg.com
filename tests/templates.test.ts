import { describe, it, expect, vi, beforeEach } from 'vitest';
import { needsLargeDiffWarning, rescaleFactor, scaleGrams } from '@/lib/templates/rescale';
import { stripAllergens, DEFAULT_ALLERGY_SYNONYMS } from '@/lib/nutrition/allergy-guard';
import { reconcile } from '@/lib/nutrition/reconciler';
import { templatesService, type TemplateSnapshot } from '@/lib/templates/templates.service';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { plansRepository } from '@/lib/db/repositories/plans.repo';
import { templatesRepository } from '@/lib/db/repositories/templates.repo';

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/db/repositories/foods.repo', () => ({
  foodsRepository: { findByIds: vi.fn().mockResolvedValue([]), findById: vi.fn(), listCandidates: vi.fn() },
}));

vi.mock('@/lib/db/repositories/visits.repo', () => ({
  visitsRepository: { listByPatient: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/plans.repo', () => ({
  plansRepository: {
    findById: vi.fn(), findOwnedById: vi.fn(), insertPlan: vi.fn(), insertMeal: vi.fn(),
    insertMealItem: vi.fn(), listByPatient: vi.fn().mockResolvedValue([]), getFullPlan: vi.fn(),
  },
  planRevisionsRepository: { nextRevisionNo: vi.fn(), insert: vi.fn(), listByPlan: vi.fn(), getByNo: vi.fn() },
}));

vi.mock('@/lib/db/repositories/templates.repo', () => ({
  templatesRepository: { insert: vi.fn(), findVisibleById: vi.fn(), listVisible: vi.fn(), incrementUsage: vi.fn(), deleteById: vi.fn() },
}));

type Mock = ReturnType<typeof vi.fn>;

const per100 = { kcal: 100, protein: 10, carbs: 10, fats: 2 };

function snapshot1800(): TemplateSnapshot {
  return {
    version: 1,
    sourcePlanId: 'plan-src',
    days: [{
      day: 1,
      meals: [{
        mealName: 'Breakfast',
        items: [
          { foodId: 'f1', nameAr: 'شوفان', nameEn: 'Oats', source: 'db', grams: 600, per100, category: null, tags: [] },
          { foodId: 'f2', nameAr: 'حليب', nameEn: 'Milk', source: 'db', grams: 600, per100, category: null, tags: [] },
          { foodId: 'f3', nameAr: 'تفاح', nameEn: 'Apple', source: 'db', grams: 600, per100, category: null, tags: [] },
        ],
      }],
    }],
    reference: { calories: 1800, proteinG: 100, carbsG: 200, fatsG: 60 },
  };
}

const patient1400 = {
  id: 'pat-1', doctor_id: 'doc-1', gender: 'female' as const,
  birth_date: new Date('1990-01-01'), height_cm: 165,
  initial_weight_kg: 60, current_weight_kg: 60,
  activity_level: 'sedentary' as const, goal: 'maintain' as const,
  chronic_conditions: null, allergies: null,
};

beforeEach(() => { vi.clearAllMocks(); });

describe('P16 template rescale math', () => {
  it('1800→1400 factor rescales grams proportionally', () => {
    expect(rescaleFactor(1800, 1400)).toBeCloseTo(0.7777, 3);
    expect(scaleGrams(100, rescaleFactor(1800, 1400))).toBeCloseTo(77.78, 1);
  });

  it('>20% warning triggers at 22% but not at 10%', () => {
    expect(needsLargeDiffWarning(1800, 1400).warn).toBe(true);
    expect(needsLargeDiffWarning(1800, 1620).warn).toBe(false);
  });

  it('reconciler lands within 5 kcal after rescale', () => {
    const factor = rescaleFactor(1800, 1400);
    const items = [
      { foodId: 'f1', name: 'شوفان', grams: scaleGrams(600, factor), per100 },
      { foodId: 'f3', name: 'تفاح', grams: scaleGrams(600, factor), per100 },
    ];
    const rec = reconcile(1400, { proteinG: 80, carbsG: 150, fatsG: 45 }, items);
    expect(rec.status).toBe('accepted');
    expect(rec.deviation_kcal).toBeLessThanOrEqual(5);
  });

  it('allergen strip removes dairy for حليب-allergic patient with report', () => {
    const items = [
      { foodId: 'f1', nameAr: 'شوفان', tags: [] as string[] },
      { foodId: 'f2', nameAr: 'حليب', tags: [] as string[] },
    ];
    const { clean, removed } = stripAllergens(items, ['حليب'], DEFAULT_ALLERGY_SYNONYMS);
    expect(clean.map((c) => c.nameAr)).toEqual(['شوفان']);
    expect(removed).toHaveLength(1);
    expect(removed[0].allergy).toBe('حليب');
  });

  it('apply creates an independent draft and leaves the template snapshot untouched', async () => {
    const snap = snapshot1800();
    const frozen = JSON.stringify(snap);
    (templatesRepository.findVisibleById as Mock).mockResolvedValue({
      id: 'tpl-1', snapshot: frozen, reference_calories: 1800,
    });
    (patientRepository.findById as Mock).mockResolvedValue(patient1400);
    (plansRepository.insertPlan as Mock).mockResolvedValue(undefined);
    (plansRepository.insertMeal as Mock).mockResolvedValue(undefined);
    (plansRepository.insertMealItem as Mock).mockResolvedValue(undefined);
    const result = await templatesService.applyToPatient('doc-1', 'tpl-1', { patient_id: 'pat-1', confirm_large_diff: true });
    expect(result.planId).toBeTruthy();
    expect(templatesRepository.incrementUsage as Mock).toHaveBeenCalledWith('tpl-1');
    expect(templatesRepository.deleteById as Mock).not.toHaveBeenCalled();
    expect(JSON.stringify(snap)).toBe(frozen);
    expect(plansRepository.insertMealItem as Mock).toHaveBeenCalled();
  });
});
