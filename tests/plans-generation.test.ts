import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generationService } from '@/lib/plans/generation.service';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { foodsRepository } from '@/lib/db/repositories/foods.repo';
import { plansRepository, planGenerationsRepository } from '@/lib/db/repositories/plans.repo';

const chatQueue: unknown[] = [];

vi.mock('@/lib/ai/client', () => ({
  getAiClientForDoctor: vi.fn(async () => ({
    chatJson: vi.fn(async () => {
      const next = chatQueue.shift();
      if (!next) throw new Error('chat queue empty');
      return next;
    }),
  })),
  getAiClient: vi.fn(),
}));

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/db/repositories/foods.repo', () => ({
  foodsRepository: { listCandidates: vi.fn() },
}));

vi.mock('@/lib/db/repositories/plans.repo', () => ({
  plansRepository: {
    findById: vi.fn(),
    findOwnedById: vi.fn(),
    archive: vi.fn(),
    insertPlan: vi.fn(),
    insertMeal: vi.fn(),
    insertMealItem: vi.fn(),
    updateVerification: vi.fn(),
    updateMealItemValues: vi.fn(),
    updateReconciled: vi.fn(),
    listByDoctor: vi.fn(),
    getFullPlan: vi.fn(),
  },
  planGenerationsRepository: { insert: vi.fn(), findByPlan: vi.fn().mockResolvedValue([]) },
}));

type Mock = ReturnType<typeof vi.fn>;
const canned = (v: unknown): void => {
  chatQueue.push(v);
};

const patient = {
  id: 'p1',
  doctor_id: 'doc1',
  gender: 'female' as const,
  birth_date: new Date('1990-01-01'),
  height_cm: 165,
  initial_weight_kg: 70,
  current_weight_kg: 70,
  activity_level: 'moderate' as const,
  goal: 'maintain' as const,
  chronic_conditions: null,
  allergies: null,
};

const rice = {
  id: 'food-rice', name_ar: 'أرز أبيض', name_en: 'rice',
  calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fats_per_100g: 0.3,
  potassium_mg_per_100g: null, phosphorus_mg_per_100g: null, sodium_mg_per_100g: null, added_sugar_g_per_100g: null,
  category: 'starch', tags: ['vegan'], pairing_tags: null, is_verified: true, owner_id: null, archived: false,
  created_at: new Date(), updated_at: new Date(),
};
const chicken = {
  ...rice, id: 'food-chicken', name_ar: 'دجاج مشوي', name_en: 'chicken',
  calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fats_per_100g: 3.6,
  category: 'protein', tags: null,
};

const baseInput = {
  patient_id: 'p1',
  target_calories: 1200,
  target_protein_g: 90,
  target_carbs_g: 150,
  target_fats_g: 40,
};

beforeEach(() => {
  vi.clearAllMocks();
  chatQueue.length = 0;
  (patientRepository.findById as unknown as Mock).mockResolvedValue({ ...patient });
});

describe('from_list generation (NUT-09)', () => {
  it('end-to-end yields a reconciled draft using ONLY admin foods, never active', async () => {
    (foodsRepository.listCandidates as unknown as Mock).mockResolvedValue([rice, chicken]);
    canned({
      meals: [
        { meal_name: 'Breakfast', items: [{ food_id: 'food-rice', grams: 300 }] },
        { meal_name: 'Lunch', items: [{ food_id: 'food-chicken', grams: 300 }] },
      ],
    });
    const res = await generationService.generate('doc1', { ...baseInput, mode: 'from_list' }, false);
    expect(res.status).toBe('pending_doctor_approval');
    expect(res.deviationKcal).toBeLessThanOrEqual(5);
    expect(res.verifiedItemsRatio).toBe(1);
    expect(res.valuesUnverified).toBe(false);
    expect(res.attempts).toBe(1);
    const planArg = (plansRepository.insertPlan as unknown as Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(planArg.status).toBe('pending_doctor_approval');
    expect(planArg.status).not.toBe('active');
    expect(planArg.generationMode).toBe('from_list');
    const usedFoodIds = new Set(
      (plansRepository.insertMealItem as unknown as Mock).mock.calls.map((c) => (c[0] as Record<string, unknown>).foodId)
    );
    expect(usedFoodIds.has('food-rice')).toBe(true);
    expect(usedFoodIds.has('food-chicken')).toBe(true);
    expect((plansRepository.insertMealItem as unknown as Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('rejects out-of-scope food_ids and regenerates (NP-21)', async () => {
    (foodsRepository.listCandidates as unknown as Mock).mockResolvedValue([rice, chicken]);
    canned({ meals: [{ meal_name: 'Breakfast', items: [{ food_id: 'ghost-food', grams: 200 }] }] });
    canned({ meals: [{ meal_name: 'Breakfast', items: [{ food_id: 'food-rice', grams: 400 }] }, { meal_name: 'Lunch', items: [{ food_id: 'food-chicken', grams: 300 }] }] });
    const res = await generationService.generate('doc1', { ...baseInput, mode: 'from_list' }, false);
    expect(res.attempts).toBe(2);
    expect(res.status).toBe('pending_doctor_approval');
  });

  it('excludes private foods unless the toggle is ON (NP-19/20)', async () => {
    const own = { ...chicken, id: 'food-own', owner_id: 'doc1' };
    (foodsRepository.listCandidates as unknown as Mock).mockImplementation(async (_doc: string, includeOwn: boolean) =>
      includeOwn ? [rice, own] : [rice]
    );
    canned({ meals: [{ meal_name: 'Breakfast', items: [{ food_id: 'food-rice', grams: 700 }] }] });
    await generationService.generate('doc1', { ...baseInput, mode: 'from_list', include_own_foods: false }, false);
    expect(foodsRepository.listCandidates).toHaveBeenCalledWith('doc1', false, 60);
    (foodsRepository.listCandidates as unknown as Mock).mockClear();
    canned({ meals: [{ meal_name: 'Breakfast', items: [{ food_id: 'food-own', grams: 400 }] }] });
    await generationService.generate('doc1', { ...baseInput, mode: 'from_list', include_own_foods: true }, false);
    expect(foodsRepository.listCandidates).toHaveBeenCalledWith('doc1', true, 60);
  });
});

describe('ai_free generation (§8.7.3)', () => {
  const riceFree = { food_name: 'أرز أبيض', grams: 500, protein_g: 13.5, carbs_g: 140, fats_g: 1.5, calories: 650 };
  const dragonFree = { food_name: 'فاكهة التنين', grams: 400, protein_g: 4, carbs_g: 59, fats_g: 1.3, calories: 253 };

  it('replaces matched values with DB data + ratio math + verification report', async () => {
    (foodsRepository.listCandidates as unknown as Mock).mockResolvedValue([rice]);
    canned({ meals: [{ meal_name: 'Lunch', items: [riceFree, dragonFree] }] });
    const res = await generationService.generate('doc1', { ...baseInput, mode: 'ai_free', ai_free_confirmed: true }, false);
    expect(res.status).toBe('pending_doctor_approval');
    expect(res.valuesUnverified).toBe(true);
    expect(res.verifiedItemsRatio).toBe(0.5);
    expect(res.report?.verified).toBe(1);
    expect(res.report?.unverified).toBe(1);
    expect(res.report?.total).toBe(2);
    expect(res.report?.reliabilityCaveat).toMatch(/less reliable/);
    expect(res.report?.mineralNotice).toMatch(/NUT-19/);
    const dbRows = (plansRepository.insertMealItem as unknown as Mock).mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((r) => r.foodNameAr === 'أرز أبيض');
    expect(dbRows.length).toBeGreaterThan(0);
    expect(dbRows[0].source).toBe('db');
    expect(dbRows[0].foodId).toBe('food-rice');
  });

  it('requires explicit confirmation first (NUT-10)', async () => {
    await expect(generationService.generate('doc1', { ...baseInput, mode: 'ai_free' }, false)).rejects.toThrow();
    expect(chatQueue.length).toBe(0);
  });

  it('rejects contradictory items and regenerates (NUT-21)', async () => {
    (foodsRepository.listCandidates as unknown as Mock).mockResolvedValue([rice]);
    canned({ meals: [{ meal_name: 'Lunch', items: [{ food_name: 'طعام مستحيل', grams: 100, protein_g: 5, carbs_g: 20, fats_g: 5, calories: 500 }] }] });
    canned({ meals: [{ meal_name: 'Lunch', items: [riceFree] }] });
    const res = await generationService.generate('doc1', { ...baseInput, mode: 'ai_free', ai_free_confirmed: true }, false);
    expect(res.attempts).toBe(2);
    expect(res.verifiedItemsRatio).toBe(1);
  });
});

describe('convert to verified (NUT-16)', () => {
  it('swaps unverified items to admin foods and re-marks the plan', async () => {
    (foodsRepository.listCandidates as unknown as Mock).mockResolvedValue([rice]);
    // Stateful double: mocked writes must be visible to the re-read, like a real DB.
    const planItems = [{ id: 'i1', meal_id: 'm1', food_id: null, food_name_ar: 'أرز أبيض', food_name_en: null, source: 'model', grams: 700, protein_g: 18.9, carbs_g: 196, fats_g: 2.1, calories: 910 }];
    (plansRepository.getFullPlan as unknown as Mock).mockResolvedValue({
      plan: { id: 'plan1', target_calories: 1200, target_protein_g: 90, target_carbs_g: 150, target_fats_g: 40, deviation_kcal: 3 },
      meals: [{ meal: { id: 'm1', day_of_week: 1, meal_name: 'Lunch' }, items: planItems }],
    });
    (plansRepository.updateMealItemValues as unknown as Mock).mockImplementation(async (id: string, patch: Record<string, unknown>) => {
      const row = planItems.find((r) => r.id === id) as unknown as Record<string, unknown>;
      if (row) Object.assign(row, { food_id: patch.foodId, source: patch.source, grams: patch.grams, protein_g: patch.proteinG, carbs_g: patch.carbsG, fats_g: patch.fatsG, calories: patch.calories });
    });
    const res = await generationService.convertToVerified('plan1', 'doc1');
    expect(res?.converted).toBe(1);
    expect(plansRepository.updateMealItemValues).toHaveBeenCalledWith('i1', expect.objectContaining({ foodId: 'food-rice', source: 'db' }));
    expect(plansRepository.updateVerification).toHaveBeenCalledWith('plan1', 'doc1', expect.objectContaining({ valuesUnverified: false, verifiedItemsRatio: 1 }));
  });
});
