import { normalizeFoodName } from '@/lib/foods';
import type { FoodItem } from '@/lib/db/repositories/foods.repo';

// NUT-13 auto-match + NUT-16 nearest-calorie swap. Deterministic, no AI:
// exact → substring → token-overlap (≥0.6). Only ADMIN (owner NULL) items
// are ever match targets — private items never leak across doctors.

function tokens(name: string): string[] {
  return normalizeFoodName(name).split(/[\s_\/-]+/).filter((t) => t.length > 1);
}

function overlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let hits = 0;
  for (const t of a) if (setB.has(t)) hits += 1;
  return hits / Math.max(a.length, b.length);
}

export interface FoodMatch {
  food: FoodItem;
  method: 'exact' | 'substring' | 'tokens';
  score: number;
}

export function matchFoodByName(nameAr: string, nameEn: string | null, adminItems: FoodItem[]): FoodMatch | null {
  const normAr = normalizeFoodName(nameAr);
  const normEn = nameEn ? normalizeFoodName(nameEn) : '';
  if (normAr === '' && normEn === '') return null;

  for (const food of adminItems) {
    if (normalizeFoodName(food.name_ar) === normAr && normAr !== '') return { food, method: 'exact', score: 1 };
    if (normEn !== '' && food.name_en && normalizeFoodName(food.name_en) === normEn) return { food, method: 'exact', score: 1 };
  }
  for (const food of adminItems) {
    const fa = normalizeFoodName(food.name_ar);
    const fe = food.name_en ? normalizeFoodName(food.name_en) : '';
    if ((normAr !== '' && fa !== '' && (fa.includes(normAr) || normAr.includes(fa)))) return { food, method: 'substring', score: 0.9 };
    if (normEn !== '' && fe !== '' && (fe.includes(normEn) || normEn.includes(fe))) return { food, method: 'substring', score: 0.9 };
  }
  let best: FoodMatch | null = null;
  const queryTokens = [...tokens(nameAr), ...(nameEn ? tokens(nameEn) : [])];
  for (const food of adminItems) {
    const score = overlapScore(queryTokens, [...tokens(food.name_ar), ...(food.name_en ? tokens(food.name_en) : [])]);
    if (score >= 0.6 && (!best || score > best.score)) best = { food, method: 'tokens', score };
  }
  return best;
}

// NUT-16: nearest-calorie admin substitute, preferring the same category.
export function nearestCalorieAdminItem(kcalPer100g: number, adminItems: FoodItem[], excludeIds: string[] = []): FoodItem | null {
  let best: FoodItem | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const food of adminItems) {
    if (excludeIds.includes(food.id)) continue;
    const diff = Math.abs(Number(food.calories_per_100g) - kcalPer100g);
    const score = diff + (food.category ? 0 : 5);
    if (score < bestScore) {
      bestScore = score;
      best = food;
    }
  }
  return best;
}
