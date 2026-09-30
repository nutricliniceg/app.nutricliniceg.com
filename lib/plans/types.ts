import type { MEAL_NAMES } from './plans.schema';

export interface PatientForPlan {
  id: string;
  doctor_id: string;
  gender: 'male' | 'female';
  birth_date: Date | string;
  height_cm: number;
  initial_weight_kg: number;
  current_weight_kg: number | null;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
  chronic_conditions: string[] | null;
  allergies: string[] | null;
}

export interface Targets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  railsClamped: boolean;
}

export interface VerificationReport {
  mode: 'from_list' | 'ai_free';
  verified: number;
  unverified: number;
  total: number;
  ratio: number;
  details: Array<{ name: string; verified: boolean; note: string }>;
  reliabilityCaveat: string | null;
  mineralNotice: string | null;
  publishWarning: boolean;
}

export interface GenerateResult {
  planId: string;
  status: 'pending_doctor_approval';
  attempts: number;
  wallTimeMs: number;
  deviationKcal: number;
  verifiedItemsRatio: number;
  valuesUnverified: boolean;
  publishWarning: boolean;
  report: VerificationReport | null;
}

export interface Per100Full {
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
  potassiumMg: number | null;
  phosphorusMg: number | null;
  sodiumMg: number | null;
  addedSugarG: number | null;
}

export interface DayItem {
  foodId: string | null;
  nameAr: string;
  nameEn: string | null;
  source: 'db' | 'model';
  grams: number;
  per100: Per100Full;
  category: string | null;
  tags: string[];
}

export interface DayMeal {
  mealName: (typeof MEAL_NAMES)[number];
  items: DayItem[];
}

export interface ReconciledPayload {
  reconciled_total_calories: number;
  reconciled_protein_g: number;
  reconciled_carbs_g: number;
  reconciled_fats_g: number;
  deviation_kcal: number;
  reconciled_at: string;
  items: Array<{ grams: number; protein_g: number; carbs_g: number; fats_g: number; calories: number }>;
}

export interface BuiltDay {
  meals: DayMeal[];
  attempts: number;
  poolCounts?: { admin: number; own: number };
  payload: ReconciledPayload;
  ratio: number;
  valuesUnverified: boolean;
  publishWarning: boolean;
  report: VerificationReport | null;
}
