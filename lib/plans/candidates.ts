import { foodsRepository, type FoodItem } from '@/lib/db/repositories/foods.repo';

// NP-19/20 + D-37: candidate pool = ADMIN public list ONLY by default; the
// doctor's private items join ONLY with the explicit toggle, ranked AFTER
// admin items. Bounded for prompt size; archived never included.
export const MAX_CANDIDATES = 60;

export interface CandidatePool {
  candidates: FoodItem[];
  adminCount: number;
  ownCount: number;
}

export async function buildCandidatePool(
  doctorId: string,
  includeOwnFoods: boolean,
  limit: number = MAX_CANDIDATES
): Promise<CandidatePool> {
  const candidates = await foodsRepository.listCandidates(doctorId, includeOwnFoods, limit);
  let adminCount = 0;
  let ownCount = 0;
  for (const c of candidates) {
    if (c.owner_id === null) adminCount += 1;
    else ownCount += 1;
  }
  return { candidates, adminCount, ownCount };
}

export function candidateLine(item: FoodItem): string {
  const parts = [item.id, item.name_ar + (item.name_en ? ` / ${item.name_en}` : '')];
  parts.push(`kcal=${item.calories_per_100g}/100g P=${item.protein_per_100g} C=${item.carbs_per_100g} F=${item.fats_per_100g}`);
  if (item.category) parts.push(`cat=${item.category}`);
  return parts.join(' | ');
}
