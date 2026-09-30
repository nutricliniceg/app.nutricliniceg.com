// NP-14/15/16/18: pure bulk-edit scope resolution + totals math (no DB).
// The editor service resolves real plans into this shape; tests drive it
// directly for affected-count correctness.

export type BulkScope = 'meal' | 'day' | 'week' | 'all-weeks';

export interface ScopeItem {
  itemId: string;
  foodKey: string;
  foodName: string;
  grams: number;
}

export interface ScopeMeal {
  mealId: string;
  day: number;
  mealName: string;
  items: ScopeItem[];
}

export interface ScopePlan {
  planId: string;
  meals: ScopeMeal[];
}

export interface BulkAnchor {
  mealId?: string;
  itemId?: string;
  foodKey?: string;
}

export interface BulkPosition {
  planId: string;
  day: number;
  mealId: string;
  mealName: string;
  itemId: string;
  foodKey: string;
  foodName: string;
  grams: number;
}

export function foodKeyOf(foodId: string | null, nameAr: string): string {
  return foodId ?? `model:${nameAr.trim()}`;
}

// Resolve every position an op touches: same food within the scope window,
// minus per-position exclusions (NP-15). Anchor identifies the edited item;
// foodKey override enables Global Swap mode (NP-18).
export function resolvePositions(
  plans: ScopePlan[],
  scope: BulkScope,
  anchor: BulkAnchor,
  exclusions: string[] = []
): BulkPosition[] {
  const excluded = new Set(exclusions);
  const anchorMeal = plans.flatMap((p) => p.meals).find((m) => m.mealId === anchor.mealId);
  const anchorItem = anchorMeal?.items.find((i) => i.itemId === anchor.itemId);
  const foodKey = anchor.foodKey ?? anchorItem?.foodKey;
  if (!foodKey) return [];
  // Food-key-only anchors (Global Swap) carry no meal context: meal/day
  // scopes are meaningless, week binds to the edited (first) plan.
  const anchorPlanId = anchor.mealId
    ? plans.find((p) => p.meals.some((m) => m.mealId === anchor.mealId))?.planId
    : plans[0]?.planId;
  if ((scope === 'meal' || scope === 'day') && !anchor.mealId) return [];
  const anchorDay = anchorMeal?.day;
  const out: BulkPosition[] = [];
  for (const plan of plans) {
    if ((scope === 'meal' || scope === 'day' || scope === 'week') && plan.planId !== anchorPlanId) continue;
    for (const meal of plan.meals) {
      if (scope === 'meal' && meal.mealId !== anchor.mealId) continue;
      if (scope === 'day' && meal.day !== anchorDay) continue;
      for (const item of meal.items) {
        if (item.foodKey !== foodKey) continue;
        if (excluded.has(item.itemId)) continue;
        out.push({
          planId: plan.planId,
          day: meal.day,
          mealId: meal.mealId,
          mealName: meal.mealName,
          itemId: item.itemId,
          foodKey: item.foodKey,
          foodName: item.foodName,
          grams: item.grams,
        });
      }
    }
  }
  return out;
}

export interface DayTotalsInput {
  grams: number;
  per100: { kcal: number; protein: number; carbs: number; fats: number };
}

export function totalsOf(items: DayTotalsInput[]): { kcal: number; protein: number; carbs: number; fats: number } {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fats = 0;
  for (const item of items) {
    const f = item.grams / 100;
    kcal += item.per100.kcal * f;
    protein += item.per100.protein * f;
    carbs += item.per100.carbs * f;
    fats += item.per100.fats * f;
  }
  return { kcal, protein, carbs, fats };
}

// NP-16: deviation alert threshold (±2% of target).
export const DEVIATION_ALERT_RATIO = 0.02;

export function deviationRatio(totalKcal: number, targetCalories: number): number {
  if (targetCalories <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(totalKcal - targetCalories) / targetCalories;
}

export function needsAutoReconcile(totalKcal: number, targetCalories: number): boolean {
  return deviationRatio(totalKcal, targetCalories) > DEVIATION_ALERT_RATIO;
}
