import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile, rm } from 'fs/promises';
import { reconcile } from '@/lib/nutrition/reconciler';
import { clampTargetCalories } from '@/lib/nutrition/rails';
import { DEFAULT_ALLERGY_SYNONYMS, stripAllergens, assertNoAllergens, itemMatchesAllergy } from '@/lib/nutrition/allergy-guard';
import { DEFAULT_CONTRA_RULES, checkContraindications } from '@/lib/nutrition/contraindications';
import { validateMealPairings } from '@/lib/nutrition/pairing';
import { runPlanChecks, suggestNearbyTarget, MAX_RECONCILE_ATTEMPTS } from '@/lib/nutrition/pipeline';
import { reportIncident } from '@/lib/nutrition/incidents';

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));

vi.mock('@/lib/db/repositories/plans.repo', () => ({
  plansRepository: {
    findById: vi.fn().mockResolvedValue({ id: 'plan1', patient_id: 'p1', doctor_id: 'doc1', status: 'active' }),
    archive: vi.fn().mockResolvedValue(true),
  },
}));

import { plansRepository } from '@/lib/db/repositories/plans.repo';

// Deterministic PRNG (mulberry32) — the 500 QA-02 cases must be reproducible.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('QA-02 reconciler property test (500 randomized cases)', () => {
  it('100% end with deviation ≤ 5 kcal and rails respected', () => {
    const rand = mulberry32(20260921);
    let accepted = 0;
    for (let i = 0; i < 500; i++) {
      const gender = i % 2 === 0 ? ('female' as const) : ('male' as const);
      const floor = gender === 'female' ? 1200 : 1500;
      const n = 2 + Math.floor(rand() * 6);
      const items = [];
      let baseKcal = 0;
      let baseP = 0;
      let baseC = 0;
      let baseF = 0;
      for (let k = 0; k < n; k++) {
        const protein = Math.round(rand() * 300) / 10;
        const carbs = Math.round(rand() * 600) / 10;
        const fats = Math.round(rand() * 350) / 10;
        const kcal = Math.round((4 * protein + 4 * carbs + 9 * fats) * (0.95 + rand() * 0.1) * 10) / 10;
        const grams = 40 + Math.floor(rand() * 211);
        baseKcal += (kcal * grams) / 100;
        baseP += (protein * grams) / 100;
        baseC += (carbs * grams) / 100;
        baseF += (fats * grams) / 100;
        items.push({ foodId: `f${k}`, name: `food ${k}`, grams, per100: { kcal, protein, carbs, fats } });
      }
      if (!items.some((it) => it.per100.kcal >= 50)) {
        items[0].per100.kcal = 150;
        baseKcal = items.reduce((s, it) => s + (it.per100.kcal * it.grams) / 100, 0);
      }
      let requested: number;
      if (i % 3 === 0) {
        // Below-floor request → clamp path. Rescale so the clamped floor is
        // reachable: base' lands within ±10% of the floor (uniform scaling
        // keeps the case solvable; the optimizer still closes the gap).
        const s = (floor * (0.9 + rand() * 0.2)) / Math.max(1, baseKcal);
        for (const it of items) it.grams = Math.max(1, Math.round(it.grams * s));
        requested = floor - 100 - Math.floor(rand() * 300);
        baseKcal = items.reduce((sum, it) => sum + (it.per100.kcal * it.grams) / 100, 0);
        baseP = items.reduce((sum, it) => sum + (it.per100.protein * it.grams) / 100, 0);
        baseC = items.reduce((sum, it) => sum + (it.per100.carbs * it.grams) / 100, 0);
        baseF = items.reduce((sum, it) => sum + (it.per100.fats * it.grams) / 100, 0);
      } else {
        requested = Math.min(4000, Math.max(floor, Math.round(baseKcal * (0.85 + rand() * 0.3))));
        if (requested > 1.6 * baseKcal) {
          // Tiny base vs a floored target: rescale uniformly so the target
          // sits inside the [0.5×, 2×] reachable band (still solvable).
          const s = (requested * 0.95) / Math.max(1, baseKcal);
          for (const it of items) it.grams = Math.max(1, Math.round(it.grams * s));
          baseKcal = items.reduce((sum, it) => sum + (it.per100.kcal * it.grams) / 100, 0);
          baseP = items.reduce((sum, it) => sum + (it.per100.protein * it.grams) / 100, 0);
          baseC = items.reduce((sum, it) => sum + (it.per100.carbs * it.grams) / 100, 0);
          baseF = items.reduce((sum, it) => sum + (it.per100.fats * it.grams) / 100, 0);
        }
      }
      const clamped = clampTargetCalories(requested, gender);
      expect(clamped.target).toBeGreaterThanOrEqual(floor);
      const res = reconcile(clamped.target, { proteinG: baseP, carbsG: baseC, fatsG: baseF }, items);
      expect(res.status).toBe('accepted');
      expect(res.deviation_kcal).toBeLessThanOrEqual(5);
      expect(res.reconciled_total_calories).toBeGreaterThanOrEqual(floor - 5);
      for (let k = 0; k < items.length; k++) {
        const g = res.items[k].grams;
        expect(g).toBeGreaterThanOrEqual(1);
        expect(g).toBeGreaterThanOrEqual(0.5 * items[k].grams - 1e-9);
        expect(g).toBeLessThanOrEqual(2 * items[k].grams + 1e-9);
        // Source of truth: values recomputed from per-100g, never model numbers
        // (cent-level: output grams are themselves 2-decimal rounded).
        expect(Math.abs(res.items[k].calories - (items[k].per100.kcal * g) / 100)).toBeLessThanOrEqual(0.011);
      }
      accepted += 1;
    }
    expect(accepted).toBe(500);
  });
});

describe('reconciler edge paths (§8.3)', () => {
  const item = (grams: number, kcal = 100, protein = 10, carbs = 10, fats = 3) => ({
    foodId: 'f1', name: 'base', grams, per100: { kcal, protein, carbs, fats },
  });

  it('accepts immediately when |total − target| ≤ 1', () => {
    const res = reconcile(100, { proteinG: 10, carbsG: 10, fatsG: 3 }, [item(100)]);
    expect(res.status).toBe('accepted');
    expect(res.iterations).toBe(0);
    expect(res.deviation_kcal).toBeLessThanOrEqual(1);
  });

  it('signals retry for unreachable targets (never publishes off-target)', () => {
    const res = reconcile(2000, { proteinG: 10, carbsG: 10, fatsG: 3 }, [item(50)]);
    expect(res.status).toBe('needs_retry');
    expect(res.deviation_kcal).toBeGreaterThan(5);
  });

  it('rejects empty/degenerate input as retry', () => {
    expect(reconcile(1500, { proteinG: 50, carbsG: 50, fatsG: 50 }, []).status).toBe('needs_retry');
  });
});

describe('allergy guard (NUT-01/02)', () => {
  const yogurt = { foodId: 'y', nameAr: 'زبادي يوناني', nameEn: 'Greek yogurt', tags: ['dairy'] };
  const rice = { foodId: 'r', nameAr: 'أرز أبيض', nameEn: 'White rice', tags: ['vegan'] };

  it('"حليب" blocks زبادي via synonyms (name + tag)', () => {
    expect(itemMatchesAllergy(yogurt, 'حليب', DEFAULT_ALLERGY_SYNONYMS)).toBe(true);
    expect(itemMatchesAllergy(rice, 'حليب', DEFAULT_ALLERGY_SYNONYMS)).toBe(false);
  });

  it('removes matches pre-draft', () => {
    const { clean, removed } = stripAllergens([yogurt, rice], ['حليب'], DEFAULT_ALLERGY_SYNONYMS);
    expect(clean.map((c) => c.foodId)).toEqual(['r']);
    expect(removed).toHaveLength(1);
    expect(removed[0].allergy).toBe('حليب');
  });

  it('hard-blocks saving a plan that still contains an allergen', () => {
    expect(assertNoAllergens([yogurt], ['حليب'], DEFAULT_ALLERGY_SYNONYMS)).toHaveLength(1);
    expect(assertNoAllergens([rice], ['حليب'], DEFAULT_ALLERGY_SYNONYMS)).toHaveLength(0);
  });
});

describe('contraindications (NUT-03)', () => {
  it('blocks a 2.0g/kg protein plan for a kidney patient', () => {
    const idealKg = 70;
    const v = checkContraindications(
      { proteinG: 140, potassiumMg: 1500, phosphorusMg: 800, sodiumMg: 1500, addedSugarG: 10 },
      ['kidney'],
      idealKg,
      DEFAULT_CONTRA_RULES
    );
    expect(v.blocks.some((b) => b.includes('protein') && b.includes('56.0g'))).toBe(true);
    expect(v.noAutoSuggest).toBe(true);
    expect(v.needsReview).toBe(true);
  });

  it('blocks excess added sugar for diabetes, warns (not blocks) for pregnancy', () => {
    const totals = { proteinG: 60, potassiumMg: 1500, phosphorusMg: 800, sodiumMg: 1500, addedSugarG: 30 };
    const d = checkContraindications(totals, ['diabetes'], 70, DEFAULT_CONTRA_RULES);
    expect(d.blocks.some((b) => b.includes('added sugar'))).toBe(true);
    const p = checkContraindications(totals, ['pregnancy'], 70, DEFAULT_CONTRA_RULES);
    expect(p.blocks).toHaveLength(0);
    expect(p.warnings.some((w) => w.includes('added sugar'))).toBe(true);
  });

  it('warns (never blocks) on unknown mineral data', () => {
    const v = checkContraindications(
      { proteinG: 40, potassiumMg: null, phosphorusMg: null, sodiumMg: null, addedSugarG: null },
      ['kidney'],
      70,
      DEFAULT_CONTRA_RULES
    );
    expect(v.blocks).toHaveLength(0);
    expect(v.warnings.some((w) => w.includes('unavailable'))).toBe(true);
  });
});

describe('pairing matrix (§8.4)', () => {
  const fish = { foodId: 'f', nameAr: 'سمك مشوي', tags: [] as string[] };
  const egg = { foodId: 'e', nameAr: 'بيض مسلوق', tags: [] as string[] };
  const milk = { foodId: 'm', nameAr: 'حليب', tags: ['dairy'] };
  const tea = { foodId: 't', nameAr: 'شاي', tags: [] as string[] };
  const liver = { foodId: 'l', nameAr: 'كبدة', tags: [] as string[] };
  const orange = { foodId: 'o', nameAr: 'برتقال', tags: [] as string[] };
  const chicken = { foodId: 'c', nameAr: 'دجاج مشوي', tags: [] as string[] };

  it('HARD-invalidates fish + egg and fish + dairy in one meal', () => {
    expect(validateMealPairings([fish, egg]).valid).toBe(false);
    expect(validateMealPairings([fish, milk]).valid).toBe(false);
  });

  it('warns (not invalid) on tea+iron, citrus+dairy, double heavy protein', () => {
    expect(validateMealPairings([tea, liver]).valid).toBe(true);
    expect(validateMealPairings([tea, liver]).warnings).toHaveLength(1);
    expect(validateMealPairings([orange, milk]).warnings.some((w) => w.includes('Citrus'))).toBe(true);
    expect(validateMealPairings([chicken, fish]).warnings.some((w) => w.includes('heavy animal proteins'))).toBe(true);
  });

  it('ignores the model claim and passes clean meals', () => {
    expect(validateMealPairings([{ foodId: 'r', nameAr: 'أرز', tags: [] }]).valid).toBe(true);
  });
});

describe('pipeline order (NUT-05) + rails + retry signal', () => {
  beforeEach(() => vi.clearAllMocks());

  const riceItem = {
    foodId: 'r', nameAr: 'أرز أبيض', nameEn: 'rice', grams: 200,
    per100: { kcal: 130, protein: 2.7, carbs: 28, fats: 0.3 },
    category: 'starch', tags: ['vegan'], pairingTags: [] as string[],
  };

  it('allergies win first over later stages', async () => {
    const v = await runPlanChecks({
      gender: 'female', heightCm: 165,
      allergies: ['حليب'],
      conditions: ['kidney'],
      targetCalories: 1500,
      macroTargets: { proteinG: 80, carbsG: 180, fatsG: 50 },
      meals: [{
        mealName: 'Lunch',
        items: [{ ...riceItem, foodId: 'y', nameAr: 'زبادي', nameEn: 'yogurt', grams: 100, per100: { kcal: 60, protein: 3.5, carbs: 4.5, fats: 3.3 }, tags: ['dairy'] }],
      }],
    });
    expect(v.verdict).toBe('blocked');
    expect(v.stage).toBe('allergies');
    expect(v.removedPreDraft).toHaveLength(1);
  });

  it('stripped allergens never reach later stages (clean remainder approves)', async () => {
    const v = await runPlanChecks({
      gender: 'female', heightCm: 165,
      allergies: ['حليب'],
      conditions: [],
      targetCalories: 1500,
      macroTargets: { proteinG: 80, carbsG: 180, fatsG: 50 },
      meals: [{
        mealName: 'Lunch',
        items: [{ ...riceItem, grams: 600 }, { ...riceItem, foodId: 'y', nameAr: 'زبادي', nameEn: 'yogurt', grams: 100, per100: { kcal: 60, protein: 3.5, carbs: 4.5, fats: 3.3 }, tags: ['dairy'] }],
      }],
    });
    expect(v.removedPreDraft).toHaveLength(1);
    expect(v.verdict).toBe('approved');
  });

  it('pairing blocks after clean allergy/contra stages', async () => {
    const v = await runPlanChecks({
      gender: 'male', heightCm: 180,
      allergies: [], conditions: [],
      targetCalories: 1500,
      macroTargets: { proteinG: 80, carbsG: 180, fatsG: 50 },
      meals: [{
        mealName: 'Dinner',
        items: [
          { foodId: 'f', nameAr: 'سمك مشوي', grams: 500, per100: { kcal: 120, protein: 20, carbs: 0, fats: 4 }, tags: [] as string[] },
          { foodId: 'e', nameAr: 'بيض مسلوق', grams: 200, per100: { kcal: 140, protein: 12, carbs: 1, fats: 10 }, tags: [] as string[] },
        ],
      }],
    });
    expect(v.verdict).toBe('blocked');
    expect(v.stage).toBe('pairing');
  });

  it('contraindications block before pairing/reconciler', async () => {
    const v = await runPlanChecks({
      gender: 'male', heightCm: 180,
      allergies: [], conditions: ['kidney'],
      targetCalories: 2500,
      macroTargets: { proteinG: 200, carbsG: 300, fatsG: 80 },
      meals: [{
        mealName: 'Lunch',
        items: [{ ...riceItem, grams: 700, per100: { kcal: 350, protein: 30, carbs: 40, fats: 10 } }],
      }],
    });
    expect(v.verdict).toBe('blocked');
    expect(v.stage).toBe('contraindications');
  });

  it('clamps below-floor targets and flags doctor notification', async () => {
    const v = await runPlanChecks({
      gender: 'female', heightCm: 165,
      allergies: [], conditions: [],
      targetCalories: 900,
      macroTargets: { proteinG: 60, carbsG: 120, fatsG: 40 },
      meals: [{ mealName: 'Lunch', items: [{ ...riceItem, grams: 900 }] }],
    });
    expect(v.railsClamped).toBe(true);
    expect(v.notifyDoctor.some((n) => n.includes('1200'))).toBe(true);
  });

  it('signals needs_retry with a nearby suggestion instead of publishing', async () => {
    const v = await runPlanChecks({
      gender: 'male', heightCm: 180,
      allergies: [], conditions: [],
      targetCalories: 4000,
      macroTargets: { proteinG: 100, carbsG: 400, fatsG: 100 },
      meals: [{ mealName: 'Lunch', items: [{ ...riceItem, grams: 100 }] }],
    });
    expect(v.verdict).toBe('needs_retry');
    expect(v.stage).toBe('reconciler');
    expect(typeof v.suggestedTarget).toBe('number');
    expect(MAX_RECONCILE_ATTEMPTS).toBe(3);
    expect(suggestNearbyTarget(1500, 1510)).toBe(1510);
  });
});

describe('incident hook (NUT-06)', () => {
  it('archives the plan and appends a QA regression case file', async () => {
    const dir = join(tmpdir(), `qa-regressions-test-${Date.now()}`);
    const record = await reportIncident('plan1', 'allergen slipped through', 'doc1', dir);
    expect(record.archived).toBe(true);
    expect(plansRepository.archive).toHaveBeenCalledWith('plan1');
    const lines = (await readFile(join(dir, 'nutrition.jsonl'), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).planId).toBe('plan1');
    await rm(dir, { recursive: true, force: true });
  });
});
