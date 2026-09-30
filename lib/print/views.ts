import { extractYoutubeId, youtubeThumbnail } from '@/lib/exercises';
import type { BrandView } from './branding';

// Pure print-view builders. They transform SERVER-PERSISTED rows only —
// there is no request-controlled input for values, so safety rails and
// reconciled numbers cannot be bypassed via print (tested).

// Patient-friendly 5g rounding for print.
export function round5(grams: number): number {
  if (!Number.isFinite(grams) || grams <= 0) return 0;
  return Math.max(5, Math.round(grams / 5) * 5);
}

export interface NutritionPrintItem {
  nameAr: string;
  nameEn: string | null;
  grams: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  calories: number;
}

export interface NutritionPrintMeal {
  day: number;
  mealName: string;
  items: NutritionPrintItem[];
}

export interface NutritionPrintView {
  brand: BrandView;
  patientName: string;
  targets: { calories: number; proteinG: number; carbsG: number; fatsG: number };
  showCalories: boolean;
  meals: NutritionPrintMeal[];
}

export function toNutritionPrintView(
  meals: Array<{ day: number; mealName: string; items: Array<{ nameAr: string; nameEn: string | null; grams: number; proteinG: number; carbsG: number; fatsG: number; calories: number }> }>,
  meta: { brand: BrandView; patientName: string; targets: NutritionPrintView['targets']; showCalories: boolean }
): NutritionPrintView {
  return {
    ...meta,
    meals: meals.map((m) => ({
      day: m.day,
      mealName: m.mealName,
      items: m.items.map((i) => ({ ...i, grams: round5(Number(i.grams)) })),
    })),
  };
}

export interface ExercisePrintItem {
  nameAr: string;
  nameEn: string | null;
  sets: number;
  reps: number;
  restSeconds: number | null;
  notes: string | null;
  youtubeUrl: string | null;
  videoId: string | null;
  thumbnail: string | null;
}

export interface ExercisePrintDay {
  day: number;
  exercises: ExercisePrintItem[];
}

export interface ExercisePrintView {
  brand: BrandView;
  patientName: string;
  days: ExercisePrintDay[];
}

export function toExercisePrintView(
  days: Array<{ day: number; exercises: Array<{ nameAr: string; nameEn: string | null; sets: number; reps: number; restSeconds: number | null; notes: string | null; youtubeUrl: string | null }> }>,
  meta: { brand: BrandView; patientName: string }
): ExercisePrintView {
  return {
    ...meta,
    days: days.map((d) => ({
      day: d.day,
      exercises: d.exercises.map((e) => {
        const videoId = extractYoutubeId(e.youtubeUrl);
        return { ...e, videoId, thumbnail: youtubeThumbnail(videoId) };
      }),
    })),
  };
}
