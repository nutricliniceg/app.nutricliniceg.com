import { randomUUID } from 'crypto';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { plansRepository } from '@/lib/db/repositories/plans.repo';
import { templatesRepository } from '@/lib/db/repositories/templates.repo';
import { calculateNutritionTargets } from '@/lib/nutrition/calc';
import { clampTargetCalories } from '@/lib/nutrition/rails';
import { stripAllergens, getAllergySynonyms } from '@/lib/nutrition/allergy-guard';
import { checkContraindications, getContraRules, normalizeCondition } from '@/lib/nutrition/contraindications';
import { idealWeightKg } from '@/lib/nutrition/rails';
import { reconcile } from '@/lib/nutrition/reconciler';
import { enrichRows, finalizeItem, fail } from '@/lib/plans';
import { needsLargeDiffWarning, rescaleFactor, scaleGrams } from './rescale';
import type { TemplateCreateInput, TemplateListQuery, TemplateApplyInput } from './templates.schema';

export interface SnapshotItem {
  foodId: string | null;
  nameAr: string;
  nameEn: string | null;
  source: 'db' | 'model';
  grams: number;
  per100: { kcal: number; protein: number; carbs: number; fats: number };
  category: string | null;
  tags: string[];
}

export interface SnapshotDay {
  day: number;
  meals: Array<{ mealName: string; items: SnapshotItem[] }>;
}

export interface TemplateSnapshot {
  version: 1;
  sourcePlanId: string;
  days: SnapshotDay[];
  reference: { calories: number; proteinG: number; carbsG: number; fatsG: number };
}

function toBirthDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export const templatesService = {
  async createFromPlan(doctorId: string, isAdmin: boolean, input: TemplateCreateInput): Promise<{ id: string }> {
    if (input.is_global && !isAdmin) throw fail('FORBIDDEN', 'Only admins can create global templates');
    const plan = await plansRepository.findOwnedById(input.plan_id, doctorId);
    if (!plan) throw fail('NOT_FOUND', 'Plan not found');
    const full = await plansRepository.getFullPlan(input.plan_id, doctorId);
    if (!full) throw fail('NOT_FOUND', 'Plan not found');
    const { days } = await enrichRows(full, null);
    const p = plan as { target_calories: number; target_protein_g: number; target_carbs_g: number; target_fats_g: number };
    const byDay = new Map<number, SnapshotDay>();
    for (const d of days) {
      if (!byDay.has(d.day)) byDay.set(d.day, { day: d.day, meals: [] });
      byDay.get(d.day)?.meals.push({
        mealName: d.mealName,
        items: d.items.map((i) => ({
          foodId: i.foodId, nameAr: i.nameAr, nameEn: i.nameEn ?? null, source: i.source, grams: i.grams,
          per100: { kcal: i.per100.kcal, protein: i.per100.protein, carbs: i.per100.carbs, fats: i.per100.fats },
          category: i.category ?? null, tags: i.tags ?? [],
        })),
      });
    }
    const snapshot: TemplateSnapshot = {
      version: 1,
      sourcePlanId: input.plan_id,
      days: [...byDay.values()].sort((a, b) => a.day - b.day),
      reference: {
        calories: Number(p.target_calories), proteinG: Number(p.target_protein_g),
        carbsG: Number(p.target_carbs_g), fatsG: Number(p.target_fats_g),
      },
    };
    const id = randomUUID();
    await templatesRepository.insert({
      id, ownerId: input.is_global ? null : doctorId, isGlobal: input.is_global ?? false,
      templateType: 'nutrition', category: input.category, name: input.name.trim(),
      description: input.description?.trim() || null, snapshot,
      referenceCalories: snapshot.reference.calories, referenceProteinG: snapshot.reference.proteinG,
      referenceCarbsG: snapshot.reference.carbsG, referenceFatsG: snapshot.reference.fatsG,
    });
    return { id };
  },

  async list(doctorId: string, query: TemplateListQuery) {
    const rows = await templatesRepository.listVisible(doctorId, {
      search: query.search, category: query.category, type: query.type ?? 'nutrition', sort: query.sort,
    });
    return rows.map((r) => ({
      id: r.id, name: r.name, category: r.category, description: r.description,
      is_global: r.is_global === true || r.is_global === 1,
      reference_calories: r.reference_calories, usage_count: r.usage_count, created_at: r.created_at,
    }));
  },

  async applyToPatient(doctorId: string, templateId: string, input: TemplateApplyInput) {
    const tpl = await templatesRepository.findVisibleById(templateId, doctorId, false);
    const tplAdmin = tpl ?? null;
    if (!tplAdmin) throw fail('NOT_FOUND', 'Template not found');
    const patient = await patientRepository.findById(input.patient_id);
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Patient not found');
    const snapshot = JSON.parse(String(tplAdmin.snapshot)) as TemplateSnapshot;
    const weight = Number(patient.current_weight_kg ?? patient.initial_weight_kg);
    const calc = calculateNutritionTargets({
      gender: patient.gender, birthDate: toBirthDate(patient.birth_date), heightCm: patient.height_cm,
      weightKg: weight, activityLevel: patient.activity_level, goal: patient.goal,
      chronicConditions: patient.chronic_conditions ?? undefined,
    });
    const clamped = clampTargetCalories(calc.targetCalories, patient.gender);
    const targets = { calories: clamped.target, proteinG: calc.targetProteinG, carbsG: calc.targetCarbsG, fatsG: calc.targetFatsG };
    const refCal = Number(tplAdmin.reference_calories) || snapshot.reference.calories;
    const warn = needsLargeDiffWarning(refCal, targets.calories);
    if (warn.warn && !input.confirm_large_diff) {
      throw fail('NEEDS_CONFIRMATION', `Template reference (${refCal} kcal) differs by ${warn.pct}% from patient target (${targets.calories} kcal) — confirm to proceed`, { pct: warn.pct, reference: refCal, target: targets.calories });
    }
    const factor = rescaleFactor(refCal, targets.calories);
    const synonyms = await getAllergySynonyms();
    const rules = await getContraRules();
    const allergies = patient.allergies ?? [];
    const conditions = (patient.chronic_conditions ?? []).map((c) => normalizeCondition(c)).filter((c): c is NonNullable<typeof c> => c !== null);
    const removed: Array<{ day: number; meal: string; name: string; allergy: string }> = [];
    const warnings: string[] = [];
    const planId = randomUUID();
    await plansRepository.insertPlan({
      id: planId, patientId: patient.id, doctorId, weekNumber: 1, status: 'pending_doctor_approval',
      generationMode: 'from_list', targetCalories: targets.calories, targetProteinG: targets.proteinG,
      targetCarbsG: targets.carbsG, targetFatsG: targets.fatsG, reconciledTotalCalories: null,
      reconciledProteinG: null, reconciledCarbsG: null, reconciledFatsG: null, deviationKcal: null,
      valuesUnverified: false, verifiedItemsRatio: 1, verificationReport: null, reconciledAt: null,
    });
    let dayDeviation = 0;
    type MealName = 'Breakfast' | 'Morning Snack' | 'Lunch' | 'Evening Snack' | 'Dinner';
    const asMealName = (v: string): MealName =>
      (['Breakfast', 'Morning Snack', 'Lunch', 'Evening Snack', 'Dinner'] as const).includes(v as MealName)
        ? (v as MealName)
        : 'Breakfast';
    for (const day of snapshot.days) {
      for (const meal of day.meals) {
        const scaled = meal.items.map((i) => ({ ...i, grams: scaleGrams(i.grams, factor) }));
        const { clean, removed: stripped } = stripAllergens(scaled, allergies, synonyms);
        for (const r of stripped) removed.push({ day: day.day, meal: meal.mealName, name: r.item.nameAr, allergy: r.allergy });
        if (clean.length === 0) continue;
        const rec = reconcile(targets.calories, { proteinG: targets.proteinG, carbsG: targets.carbsG, fatsG: targets.fatsG }, clean.map((i) => ({ foodId: i.foodId, name: i.nameAr, grams: i.grams, per100: i.per100 })));
        dayDeviation = Math.max(dayDeviation, rec.deviation_kcal);
        const mealId = randomUUID();
        await plansRepository.insertMeal({ id: mealId, planId, dayOfWeek: day.day, mealName: asMealName(meal.mealName), culinaryPairingsValid: true });
        for (let k = 0; k < clean.length; k++) {
          const item = clean[k];
          const recItem = rec.items[k];
          const grams = recItem ? recItem.grams : item.grams;
          const persisted = finalizeItem({ foodId: item.foodId, nameAr: item.nameAr, nameEn: item.nameEn, source: item.source, grams, per100: { ...item.per100, potassiumMg: null, phosphorusMg: null, sodiumMg: null, addedSugarG: null }, category: item.category, tags: item.tags });
          await plansRepository.insertMealItem({ id: randomUUID(), mealId, foodId: persisted.foodId, foodNameAr: persisted.nameAr, foodNameEn: persisted.nameEn, source: persisted.source, grams: persisted.grams, proteinG: persisted.proteinG, carbsG: persisted.carbsG, fatsG: persisted.fatsG, calories: persisted.calories });
        }
      }
    }
    const contra = checkContraindications({ proteinG: targets.proteinG, potassiumMg: null, phosphorusMg: null, sodiumMg: null, addedSugarG: null }, patient.chronic_conditions ?? [], idealWeightKg(patient.height_cm), rules);
    warnings.push(...contra.warnings, ...contra.blocks);
    await templatesRepository.incrementUsage(templateId);
    return { planId, removed, warnings, deviationKcal: dayDeviation, largeDiffPct: warn.pct, targets, conditions };
  },

  async updateTemplate(doctorId: string, isAdmin: boolean, id: string, patch: { name?: string; category?: string; description?: string | null }): Promise<void> {
    const row = await templatesRepository.findVisibleById(id, doctorId, isAdmin);
    if (!row) throw fail('NOT_FOUND', 'Template not found');
    const global = row.is_global === true || row.is_global === 1;
    if (global && !isAdmin) throw fail('FORBIDDEN', 'Only admins can edit global templates');
    if (!global && row.owner_id !== doctorId && !isAdmin) throw fail('NOT_FOUND', 'Template not found');
    await templatesRepository.updateById(id, patch);
  },

  async removeTemplate(doctorId: string, isAdmin: boolean, id: string): Promise<void> {
    const row = await templatesRepository.findVisibleById(id, doctorId, isAdmin);
    if (!row) throw fail('NOT_FOUND', 'Template not found');
    const global = row.is_global === true || row.is_global === 1;
    if (global && !isAdmin) throw fail('FORBIDDEN', 'Only admins can archive global templates');
    if (!global && row.owner_id !== doctorId && !isAdmin) throw fail('NOT_FOUND', 'Template not found');
    await templatesRepository.deleteById(id);
  },
};
