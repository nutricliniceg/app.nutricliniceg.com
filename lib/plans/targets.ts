import { calculateNutritionTargets } from '@/lib/nutrition/calc';
import { clampTargetCalories } from '@/lib/nutrition/rails';
import { sanitizeUntrusted, fencePatientData } from '@/lib/ai/sanitize';
import type { PlanGenerateInput } from './plans.schema';
import type { PatientForPlan, Targets } from './types';

function toBirthDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export async function resolveTargets(patient: PatientForPlan, input: PlanGenerateInput): Promise<Targets> {
  const calc = calculateNutritionTargets({
    gender: patient.gender,
    birthDate: toBirthDate(patient.birth_date),
    heightCm: patient.height_cm,
    weightKg: Number(patient.current_weight_kg ?? patient.initial_weight_kg),
    activityLevel: patient.activity_level,
    goal: patient.goal,
    chronicConditions: patient.chronic_conditions ?? undefined,
  });
  const requested = Math.round(input.target_calories ?? calc.targetCalories);
  const clamped = clampTargetCalories(requested, patient.gender);
  return {
    calories: clamped.target,
    proteinG: Math.round(input.target_protein_g ?? calc.targetProteinG),
    carbsG: Math.round(input.target_carbs_g ?? calc.targetCarbsG),
    fatsG: Math.round(input.target_fats_g ?? calc.targetFatsG),
    railsClamped: clamped.clamped,
  };
}

export function fencedPrefs(input: PlanGenerateInput): string {
  const prefs = input.preferences ?? {};
  const parts = [
    `cuisine=${prefs.cuisine ?? 'general'}`,
    `mealsPerDay=${prefs.mealsPerDay ?? 4}`,
    `dislikes=${prefs.dislikes ?? 'none'}`,
  ];
  return fencePatientData(sanitizeUntrusted(parts.join(' | ')));
}
