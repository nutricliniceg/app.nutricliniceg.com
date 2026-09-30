import type { FullPlan } from '@/lib/db/repositories/plans.repo';

// NP-13: revision snapshots + human-readable diffs. Snapshots are plain JSON
// (targets + full meal/item content); restores always append — never rewrite.

export interface SnapshotItem {
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

export interface SnapshotMeal {
  day: number;
  mealName: string;
  pairingValid: boolean;
  items: SnapshotItem[];
}

export interface PlanSnapshot {
  version: 1;
  targets: { calories: number; proteinG: number; carbsG: number; fatsG: number };
  status: string;
  meals: SnapshotMeal[];
}

export function buildSnapshot(
  full: FullPlan,
  targets: { calories: number; proteinG: number; carbsG: number; fatsG: number },
  status: string
): PlanSnapshot {
  return {
    version: 1,
    targets,
    status,
    meals: full.meals.map((m) => ({
      day: Number(m.meal.day_of_week),
      mealName: String(m.meal.meal_name),
      pairingValid: Boolean(m.meal.culinary_pairings_valid),
      items: m.items.map((i) => ({
        foodId: i.food_id,
        nameAr: i.food_name_ar,
        nameEn: i.food_name_en,
        source: i.source,
        grams: Number(i.grams),
        proteinG: Number(i.protein_g),
        carbsG: Number(i.carbs_g),
        fatsG: Number(i.fats_g),
        calories: Number(i.calories),
      })),
    })),
  };
}

export interface SnapshotDiff {
  added: number;
  removed: number;
  gramsChanged: number;
  kcalDelta: number;
}

function itemKey(day: number, meal: string, item: SnapshotItem): string {
  return `${day}|${meal}|${item.foodId ?? `model:${item.nameAr}`}`;
}

export function diffSnapshots(prev: PlanSnapshot, next: PlanSnapshot): SnapshotDiff {
  const prevMap = new Map<string, SnapshotItem>();
  for (const m of prev.meals) {
    for (const i of m.items) prevMap.set(itemKey(m.day, m.mealName, i), i);
  }
  const nextMap = new Map<string, SnapshotItem>();
  for (const m of next.meals) {
    for (const i of m.items) nextMap.set(itemKey(m.day, m.mealName, i), i);
  }
  let added = 0;
  let removed = 0;
  let gramsChanged = 0;
  for (const [key, item] of nextMap) {
    const old = prevMap.get(key);
    if (!old) added += 1;
    else if (Math.abs(old.grams - item.grams) > 1e-9) gramsChanged += 1;
  }
  for (const key of prevMap.keys()) {
    if (!nextMap.has(key)) removed += 1;
  }
  const kcal = (s: PlanSnapshot): number => s.meals.flatMap((m) => m.items).reduce((sum, i) => sum + i.calories, 0);
  return { added, removed, gramsChanged, kcalDelta: Math.round((kcal(next) - kcal(prev)) * 100) / 100 };
}

export function parseSnapshot(raw: string): PlanSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as PlanSnapshot;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.meals)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface RevisionSummary {
  revision_no: number;
  change_note: string | null;
  changed_by: string;
  created_at: Date;
  summary: SnapshotDiff & { targetsChanged: boolean };
}

// Newest-first rows; each revision diffed against its predecessor (older).
export function summarizeRevisions(
  rows: Array<{ revision_no: number; change_note: string | null; changed_by: string; created_at: Date; snapshot: string }>
): RevisionSummary[] {
  const parsed = rows.map((r) => ({ row: r, snapshot: parseSnapshot(r.snapshot) }));
  return parsed.map(({ row, snapshot }, idx) => {
    const older = parsed[idx + 1]?.snapshot;
    const diff = snapshot && older ? diffSnapshots(older, snapshot) : { added: 0, removed: 0, gramsChanged: 0, kcalDelta: 0 };
    const targetsChanged = Boolean(
      snapshot && older && (
        snapshot.targets.calories !== older.targets.calories ||
        snapshot.targets.proteinG !== older.targets.proteinG ||
        snapshot.targets.carbsG !== older.targets.carbsG ||
        snapshot.targets.fatsG !== older.targets.fatsG
      )
    );
    return {
      revision_no: row.revision_no,
      change_note: row.change_note,
      changed_by: row.changed_by,
      created_at: row.created_at,
      summary: { ...diff, targetsChanged },
    };
  });
}
