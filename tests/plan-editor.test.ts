import { describe, it, expect, vi, beforeEach } from 'vitest';
import { editorService } from '@/lib/plans/editor.service';
import { bulkService } from '@/lib/plans/bulk.service';
import { previewItemValues, finalizeItem } from '@/lib/plans/day-items';
import { resolvePositions, type ScopePlan } from '@/lib/plans/bulk';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { foodsRepository } from '@/lib/db/repositories/foods.repo';
import { plansRepository, planRevisionsRepository } from '@/lib/db/repositories/plans.repo';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/db/repositories/foods.repo', () => ({
  foodsRepository: { findById: vi.fn(), findByIds: vi.fn(), listCandidates: vi.fn() },
}));

vi.mock('@/lib/db/repositories/visits.repo', () => ({
  visitsRepository: { listByPatient: vi.fn().mockResolvedValue([]) },
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
    updatePlanTargets: vi.fn(),
    updateStatus: vi.fn(),
    deleteMealsByPlan: vi.fn(),
    listByDoctor: vi.fn(),
    listByPatient: vi.fn(),
    getFullPlan: vi.fn(),
  },
  planRevisionsRepository: {
    nextRevisionNo: vi.fn(),
    insert: vi.fn(),
    listByPlan: vi.fn(),
    getByNo: vi.fn(),
  },
}));

type Mock = ReturnType<typeof vi.fn>;

const patient = {
  id: 'p1', doctor_id: 'doc1', gender: 'female' as const,
  birth_date: new Date('1990-01-01'), height_cm: 165,
  initial_weight_kg: 70, current_weight_kg: 70,
  activity_level: 'moderate' as const, goal: 'maintain' as const,
  chronic_conditions: null, allergies: null,
};

const rice = {
  id: 'food-rice', name_ar: 'أرز أبيض', name_en: 'rice',
  calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fats_per_100g: 0.3,
  potassium_mg_per_100g: null, phosphorus_mg_per_100g: null, sodium_mg_per_100g: null, added_sugar_g_per_100g: null,
  category: 'starch', tags: ['vegan'], pairing_tags: null, is_verified: true, owner_id: null, archived: false,
  created_at: new Date(), updated_at: new Date(),
};

const planRow = {
  id: 'plan1', patient_id: 'p1', doctor_id: 'doc1', status: 'pending_doctor_approval',
  target_calories: 1200, target_protein_g: 90, target_carbs_g: 150, target_fats_g: 40,
};

function riceRow(itemId: string, mealId: string, grams: number) {
  const f = grams / 100;
  return {
    id: itemId, meal_id: mealId, food_id: 'food-rice', food_name_ar: 'أرز أبيض', food_name_en: 'rice',
    source: 'db' as const, grams, protein_g: 2.7 * f, carbs_g: 28 * f, fats_g: 0.3 * f, calories: 130 * f,
  };
}

function fullPlan(itemGrams: number, days = [1]) {
  return {
    plan: { ...planRow },
    meals: days.map((day) => ({
      meal: { id: `m${day}`, plan_id: 'plan1', day_of_week: day, meal_name: 'Lunch', culinary_pairings_valid: true },
      items: [riceRow(`i${day}`, `m${day}`, itemGrams)],
    })),
  };
}

let revisionCounter = 0;
beforeEach(() => {
  vi.clearAllMocks();
  revisionCounter = 0;
  (patientRepository.findById as unknown as Mock).mockResolvedValue({ ...patient });
  (foodsRepository.findById as unknown as Mock).mockResolvedValue({ ...rice });
  (foodsRepository.findByIds as unknown as Mock).mockImplementation(async (ids: string[]) =>
    ids.includes('food-rice') ? [{ ...rice }] : []
  );
  (foodsRepository.listCandidates as unknown as Mock).mockResolvedValue([{ ...rice }]);
  (planRevisionsRepository.nextRevisionNo as unknown as Mock).mockImplementation(async () => {
    revisionCounter += 1;
    return revisionCounter;
  });
});

describe('live-recalc parity (NP-12)', () => {
  it('client preview math equals the server authoritative math', () => {
    const per100 = { kcal: 130, protein: 2.7, carbs: 28, fats: 0.3 };
    const preview = previewItemValues(per100, 200);
    const finalized = finalizeItem({
      foodId: 'food-rice', nameAr: 'أرز أبيض', nameEn: null, source: 'db',
      grams: 200, per100: { ...per100, potassiumMg: null, phosphorusMg: null, sodiumMg: null, addedSugarG: null },
      category: null, tags: [],
    });
    expect(preview).toEqual({ grams: finalized.grams, proteinG: finalized.proteinG, carbsG: finalized.carbsG, fatsG: finalized.fatsG, calories: finalized.calories });
    expect(preview.calories).toBe(260);
  });
});

describe('bulk scope resolution (NP-14/15)', () => {
  const plans: ScopePlan[] = [
    {
      planId: 'week1',
      meals: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
        mealId: `m${day}`, day, mealName: 'Lunch',
        items: [{ itemId: `i${day}`, foodKey: 'food-rice', foodName: 'أرز أبيض', grams: 200 }],
      })),
    },
    {
      planId: 'week2',
      meals: [{ mealId: 'n1', day: 1, mealName: 'Lunch', items: [{ itemId: 'j1', foodKey: 'food-rice', foodName: 'أرز أبيض', grams: 200 }] }],
    },
  ];

  it('meal → 1, day → 1, week → 7, all-weeks → 8 positions', () => {
    const anchor = { mealId: 'm3', itemId: 'i3' };
    expect(resolvePositions(plans, 'meal', anchor)).toHaveLength(1);
    expect(resolvePositions(plans, 'day', anchor)).toHaveLength(1);
    expect(resolvePositions(plans, 'week', anchor)).toHaveLength(7);
    expect(resolvePositions(plans, 'all-weeks', anchor)).toHaveLength(8);
  });

  it('per-position exclusions are honored (NP-15)', () => {
    expect(resolvePositions(plans, 'all-weeks', { mealId: 'm3', itemId: 'i3' }, ['i3'])).toHaveLength(7);
  });

  it('global swap anchors by food key without an item (NP-18)', () => {
    expect(resolvePositions(plans, 'week', { foodKey: 'food-rice' })).toHaveLength(7);
  });
});

describe('bulk apply + undo (NP-16/17)', () => {
  it('deviation alert fires and the reconciler pulls back to ±5', async () => {
    (plansRepository.findOwnedById as unknown as Mock).mockResolvedValue({ ...planRow });
    (plansRepository.getFullPlan as unknown as Mock).mockResolvedValue(fullPlan(200, [1]));
    const res = await bulkService.bulkEdit('plan1', 'doc1', {
      scope: 'week',
      anchor: { meal_id: 'm1', item_id: 'i1' },
      op: { type: 'set_grams', grams: 600 },
    }, false);
    expect(res && 'plans' in res && (res as { plans: Array<{ deviationAlert: boolean; deviationKcal: number }> }).plans[0].deviationAlert).toBe(true);
    expect(res && 'plans' in res && (res as { plans: Array<{ deviationKcal: number }> }).plans[0].deviationKcal).toBeLessThanOrEqual(5);
    expect(res && 'undo' in res && (res as { undo: unknown[] }).undo).toHaveLength(1);
    expect(res && 'undo' in res && (res as { undo: Array<{ revisionNo: number }> }).undo[0].revisionNo).toBe(1);
  });

  it('undo via the pre-apply revision restores exact grams', async () => {
    (plansRepository.findOwnedById as unknown as Mock).mockResolvedValue({ ...planRow });
    (plansRepository.getFullPlan as unknown as Mock).mockResolvedValue(fullPlan(200, [1]));
    const applied = await bulkService.bulkEdit('plan1', 'doc1', {
      scope: 'week',
      anchor: { meal_id: 'm1', item_id: 'i1' },
      op: { type: 'set_grams', grams: 600 },
    }, false);
    expect(applied && 'undo' in applied && (applied as { undo: Array<{ revisionNo: number }> }).undo[0].revisionNo).toBe(1);
    // Restore replays the pre-apply snapshot (original 200g).
    (planRevisionsRepository.getByNo as unknown as Mock).mockResolvedValue({
      revision_no: 1,
      snapshot: JSON.stringify({
        version: 1,
        targets: { calories: 1200, proteinG: 90, carbsG: 150, fatsG: 40 },
        status: 'pending_doctor_approval',
        meals: [{ day: 1, mealName: 'Lunch', pairingValid: true, items: [{
          foodId: 'food-rice', nameAr: 'أرز أبيض', nameEn: 'rice', source: 'db',
          grams: 200, proteinG: 5.4, carbsG: 56, fatsG: 0.6, calories: 260,
        }] }],
      }),
    });
    const inserted: number[] = [];
    (plansRepository.insertMealItem as unknown as Mock).mockImplementation(async (row: { grams: number }) => {
      inserted.push(Number(row.grams));
    });
    const restored = await editorService.restoreRevision('plan1', 'doc1', 1);
    expect(restored?.restored).toBe(1);
    expect(inserted).toEqual([200]);
  });
});

describe('revision restore integrity (NP-13)', () => {
  it('restore replaces content and records a pre-restore backup revision', async () => {
    (plansRepository.findOwnedById as unknown as Mock).mockResolvedValue({ ...planRow });
    (plansRepository.getFullPlan as unknown as Mock).mockResolvedValue(fullPlan(600, [1]));
    (planRevisionsRepository.getByNo as unknown as Mock).mockResolvedValue({
      revision_no: 3,
      snapshot: JSON.stringify({
        version: 1,
        targets: { calories: 1200, proteinG: 90, carbsG: 150, fatsG: 40 },
        status: 'pending_doctor_approval',
        meals: [{ day: 1, mealName: 'Lunch', pairingValid: true, items: [{
          foodId: 'food-rice', nameAr: 'أرز أبيض', nameEn: 'rice', source: 'db',
          grams: 200, proteinG: 5.4, carbsG: 56, fatsG: 0.6, calories: 260,
        }] }],
      }),
    });
    const notes: Array<string | null | undefined> = [];
    (planRevisionsRepository.insert as unknown as Mock).mockImplementation(async (row: { changeNote?: string | null }) => {
      notes.push(row.changeNote);
    });
    const res = await editorService.restoreRevision('plan1', 'doc1', 3);
    expect(res?.restored).toBe(3);
    expect(plansRepository.deleteMealsByPlan).toHaveBeenCalledWith('plan1');
    expect(notes.some((n) => n?.includes('Pre-restore backup'))).toBe(true);
    expect(plansRepository.updateStatus).toHaveBeenCalledWith('plan1', 'doc1', 'draft');
  });
});

describe('approval gating (NP-07)', () => {
  it('rejects unreconciled plans (deviation > 5)', async () => {
    (plansRepository.findOwnedById as unknown as Mock).mockResolvedValue({ ...planRow });
    (plansRepository.getFullPlan as unknown as Mock).mockResolvedValue(fullPlan(200, [1]));
    await expect(editorService.approve('plan1', 'doc1')).rejects.toThrow();
  });

  it('blocks plans failing the allergy re-check', async () => {
    (patientRepository.findById as unknown as Mock).mockResolvedValue({ ...patient, allergies: ['حليب'] });
    (foodsRepository.findByIds as unknown as Mock).mockResolvedValue([
      { ...rice, id: 'food-yogurt', name_ar: 'زبادي', name_en: 'yogurt', tags: ['dairy'] },
    ]);
    const yogurtPlan = {
      plan: { ...planRow, target_calories: 1200 },
      meals: [{
        meal: { id: 'm1', plan_id: 'plan1', day_of_week: 1, meal_name: 'Lunch', culinary_pairings_valid: true },
        items: [{
          id: 'i1', meal_id: 'm1', food_id: 'food-yogurt', food_name_ar: 'زبادي', food_name_en: 'yogurt',
          source: 'db' as const, grams: 1900, protein_g: 66, carbs_g: 85, fats_g: 62, calories: 1195,
        }],
      }],
    };
    (plansRepository.findOwnedById as unknown as Mock).mockResolvedValue({ ...planRow });
    (plansRepository.getFullPlan as unknown as Mock).mockResolvedValue(yogurtPlan);
    await expect(editorService.approve('plan1', 'doc1')).rejects.toThrow();
  });

  it('approves reconciled, guard-clean plans with stamps', async () => {
    (plansRepository.findOwnedById as unknown as Mock).mockResolvedValue({ ...planRow });
    (plansRepository.getFullPlan as unknown as Mock).mockResolvedValue(fullPlan(923, [1]));
    const res = await editorService.approve('plan1', 'doc1');
    expect(res?.status).toBe('active');
    expect(res?.deviationKcal).toBeLessThanOrEqual(5);
    expect(plansRepository.updateStatus).toHaveBeenCalledWith('plan1', 'doc1', 'active', 'doc1');
  });
});
