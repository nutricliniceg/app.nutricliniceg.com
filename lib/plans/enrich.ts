import { foodsRepository } from '@/lib/db/repositories/foods.repo';
import type { FullPlan } from '@/lib/db/repositories/plans.repo';
import type { PlanCheckItem } from '@/lib/nutrition/pipeline';

// Shared enrichment: DB rows → guard-ready items with per-100g values.
// db foods resolve via FoodItem; model items rescale from stored values.
// No client numbers are ever trusted — rates always come from server data.
export interface EnrichedItem extends Omit<PlanCheckItem, 'foodId'> {
  rowId: string | null;
  foodId: string | null;
  source: 'db' | 'model';
}

export interface EnrichedDay {
  day: number;
  mealId: string | null;
  mealName: string;
  items: EnrichedItem[];
}

export async function enrichRows(
  full: FullPlan,
  visibleFoodIds: Set<string> | null
): Promise<{ days: EnrichedDay[]; unknownFoods: string[] }> {
  const dbIds = [...new Set(full.meals.flatMap((m) => m.items).filter((i) => i.food_id).map((i) => i.food_id as string))];
  const foods = dbIds.length > 0 ? await foodsRepository.findByIds(dbIds) : [];
  const byId = new Map(foods.map((f) => [f.id, f]));
  const unknownFoods: string[] = [];
  const days: EnrichedDay[] = full.meals.map((m) => ({
    day: Number(m.meal.day_of_week),
    mealId: m.meal.id,
    mealName: String(m.meal.meal_name),
    items: m.items.map((row) => {
      if (row.food_id) {
        const food = byId.get(row.food_id);
        if (!food || (visibleFoodIds && !visibleFoodIds.has(food.id))) {
          unknownFoods.push(row.food_id);
        }
        const per100 = food
          ? {
              kcal: Number(food.calories_per_100g), protein: Number(food.protein_per_100g),
              carbs: Number(food.carbs_per_100g), fats: Number(food.fats_per_100g),
              potassiumMg: food.potassium_mg_per_100g, phosphorusMg: food.phosphorus_mg_per_100g,
              sodiumMg: food.sodium_mg_per_100g, addedSugarG: food.added_sugar_g_per_100g,
            }
          : { kcal: 0, protein: 0, carbs: 0, fats: 0, potassiumMg: null, phosphorusMg: null, sodiumMg: null, addedSugarG: null };
        return {
          rowId: row.id, source: row.source, foodId: row.food_id, nameAr: row.food_name_ar, nameEn: row.food_name_en,
          grams: Number(row.grams), per100, category: food?.category ?? null, tags: food?.tags ?? [], pairingTags: [],
        };
      }
      const grams = Number(row.grams) || 0;
      const f = grams > 0 ? 100 / grams : 0;
      return {
        rowId: row.id, source: 'model' as const, foodId: null, nameAr: row.food_name_ar, nameEn: row.food_name_en,
        grams,
        per100: {
          kcal: Number(row.calories) * f, protein: Number(row.protein_g) * f,
          carbs: Number(row.carbs_g) * f, fats: Number(row.fats_g) * f,
          potassiumMg: null, phosphorusMg: null, sodiumMg: null, addedSugarG: null,
        },
        category: null, tags: [], pairingTags: [],
      };
    }),
  }));
  return { days, unknownFoods };
}

export async function visibleFoodIdSet(doctorId: string, isAdmin: boolean): Promise<Set<string> | null> {
  if (isAdmin) return null;
  const rows = await foodsRepository.listCandidates(doctorId, true, 200);
  return new Set(rows.map((r) => r.id));
}

export function dayTotalKcal(items: Array<{ grams: number; per100: { kcal: number } }>): number {
  return items.reduce((s, i) => s + (i.per100.kcal * i.grams) / 100, 0);
}
