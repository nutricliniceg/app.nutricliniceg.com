import type { FoodItem } from '@/lib/db/repositories/foods.repo';
import type { PlanCheckItem } from '@/lib/nutrition/pipeline';
import type { DayItem, DayMeal, ReconciledPayload } from './types';

export function dbItem(food: FoodItem, grams: number): DayItem {
  return {
    foodId: food.id,
    nameAr: food.name_ar,
    nameEn: food.name_en,
    source: 'db',
    grams,
    per100: {
      kcal: Number(food.calories_per_100g),
      protein: Number(food.protein_per_100g),
      carbs: Number(food.carbs_per_100g),
      fats: Number(food.fats_per_100g),
      potassiumMg: food.potassium_mg_per_100g,
      phosphorusMg: food.phosphorus_mg_per_100g,
      sodiumMg: food.sodium_mg_per_100g,
      addedSugarG: food.added_sugar_g_per_100g,
    },
    category: food.category,
    tags: food.tags ?? [],
  };
}

export function toCheckMeals(meals: DayMeal[]): Array<{ mealName: string; items: PlanCheckItem[] }> {
  return meals.map((m) => ({
    mealName: m.mealName,
    items: m.items.map((i) => ({
      foodId: i.foodId ?? `model:${i.nameAr}`,
      nameAr: i.nameAr,
      nameEn: i.nameEn,
      grams: i.grams,
      per100: i.per100,
      category: i.category,
      tags: i.tags,
      pairingTags: [],
    })),
  }));
}

// Map flat reconciler output back onto the day template (same order).
export function applyReconciledGrams(meals: DayMeal[], flat: Array<{ grams: number }>): DayMeal[] {
  let offset = 0;
  return meals.map((m) => {
    const items = m.items.map((item, k) => ({ ...item, grams: flat[offset + k] ? flat[offset + k].grams : item.grams }));
    offset += m.items.length;
    return { ...m, items };
  });
}

export function toPayload(
  result: { reconciled_total_calories: number; deviation_kcal: number; reconciled_at: string; items: Array<{ grams: number; protein_g: number; carbs_g: number; fats_g: number; calories: number }> }
): ReconciledPayload {
  return {
    reconciled_total_calories: result.reconciled_total_calories,
    reconciled_protein_g: Math.round(result.items.reduce((s, i) => s + i.protein_g, 0)),
    reconciled_carbs_g: Math.round(result.items.reduce((s, i) => s + i.carbs_g, 0)),
    reconciled_fats_g: Math.round(result.items.reduce((s, i) => s + i.fats_g, 0)),
    deviation_kcal: result.deviation_kcal,
    reconciled_at: result.reconciled_at,
    items: result.items,
  };
}

export interface PersistedMealItem {
  foodId: string | null;
  nameAr: string;
  nameEn: string | null;
  source: 'db' | 'model';
  grams: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  calories: number;
}

export interface PreviewValues {
  grams: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  calories: number;
}

// NP-12 live preview math — shared by the browser editor AND the server so
// client/server parity holds by construction (same function, same floats).
// Server recomputes authoritatively on save; client numbers are never trusted.
export function previewItemValues(
  per100: { kcal: number; protein: number; carbs: number; fats: number },
  grams: number
): PreviewValues {
  const f = grams / 100;
  const round2 = (n: number): number => Math.round(n * 100) / 100;
  return {
    grams: round2(grams),
    proteinG: round2(per100.protein * f),
    carbsG: round2(per100.carbs * f),
    fatsG: round2(per100.fats * f),
    calories: round2(per100.kcal * f),
  };
}

export function finalizeItem(item: DayItem): PersistedMealItem {
  const preview = previewItemValues(item.per100, item.grams);
  return {
    foodId: item.foodId,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    source: item.source,
    ...preview,
  };
}
