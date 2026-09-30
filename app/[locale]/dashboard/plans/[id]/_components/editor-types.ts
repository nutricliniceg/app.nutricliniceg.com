'use client';

import { previewItemValues } from '@/lib/plans/day-items';

// Editable client shapes. per100 comes from GET /api/plans/[id] (db items);
// model items carry server-derived per-gram rates in per100.
export interface EditItem {
  clientId: string;
  rowId: string | null;
  foodId: string | null;
  nameAr: string;
  nameEn: string | null;
  source: 'db' | 'model';
  grams: string;
  per100: { kcal: number; protein: number; carbs: number; fats: number };
}

export interface EditMeal {
  clientId: string;
  mealId: string | null;
  day: number;
  mealName: string;
  items: EditItem[];
}

export interface Per100Map {
  [foodId: string]: { kcal: number; protein: number; carbs: number; fats: number };
}

export function itemTotals(item: EditItem): { proteinG: number; carbsG: number; fatsG: number; calories: number } {
  const grams = Number(item.grams) || 0;
  return previewItemValues(item.per100, grams);
}

export function mealTotals(meal: EditMeal): { proteinG: number; carbsG: number; fatsG: number; calories: number } {
  const total = { proteinG: 0, carbsG: 0, fatsG: 0, calories: 0 };
  for (const item of meal.items) {
    const v = itemTotals(item);
    total.proteinG += v.proteinG;
    total.carbsG += v.carbsG;
    total.fatsG += v.fatsG;
    total.calories += v.calories;
  }
  return {
    proteinG: Math.round(total.proteinG * 100) / 100,
    carbsG: Math.round(total.carbsG * 100) / 100,
    fatsG: Math.round(total.fatsG * 100) / 100,
    calories: Math.round(total.calories * 100) / 100,
  };
}

export function dayTotals(meals: EditMeal[], day: number): { proteinG: number; carbsG: number; fatsG: number; calories: number } {
  const total = { proteinG: 0, carbsG: 0, fatsG: 0, calories: 0 };
  for (const meal of meals.filter((m) => m.day === day)) {
    const v = mealTotals(meal);
    total.proteinG += v.proteinG;
    total.carbsG += v.carbsG;
    total.fatsG += v.fatsG;
    total.calories += v.calories;
  }
  return {
    proteinG: Math.round(total.proteinG * 100) / 100,
    carbsG: Math.round(total.carbsG * 100) / 100,
    fatsG: Math.round(total.fatsG * 100) / 100,
    calories: Math.round(total.calories * 100) / 100,
  };
}

let counter = 0;
export function cid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}
