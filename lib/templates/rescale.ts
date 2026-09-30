// PT-03/PT-04 pure math — no AI, no DB. Reconciler (P13) does the final
// landing; this module only computes the proportional starting point and
// the >20% pre-apply warning gate.

export const LARGE_DIFF_THRESHOLD = 0.2;

export function pctDiff(referenceCalories: number, targetCalories: number): number {
  if (!Number.isFinite(referenceCalories) || referenceCalories <= 0) return 0;
  return Math.abs(targetCalories - referenceCalories) / referenceCalories;
}

export function needsLargeDiffWarning(referenceCalories: number, targetCalories: number): { warn: boolean; pct: number } {
  const pct = pctDiff(referenceCalories, targetCalories);
  return { warn: pct > LARGE_DIFF_THRESHOLD, pct: Math.round(pct * 1000) / 10 };
}

export function rescaleFactor(referenceCalories: number, targetCalories: number): number {
  if (!Number.isFinite(referenceCalories) || referenceCalories <= 0) return 1;
  if (!Number.isFinite(targetCalories) || targetCalories <= 0) return 1;
  return targetCalories / referenceCalories;
}

export function scaleGrams(grams: number, factor: number): number {
  const scaled = grams * factor;
  if (!Number.isFinite(scaled) || scaled <= 0) return grams;
  return Math.min(2000, Math.max(1, Math.round(scaled * 100) / 100));
}
