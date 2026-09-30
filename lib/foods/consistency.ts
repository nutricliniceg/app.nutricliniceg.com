// FL-04 / FL-09 / FL-14: deterministic food quality checks (pure, no AI, no DB).
// - kcal consistency: declared kcal must match 4P+4C+9F within ±15%
// - name normalization + duplicate detection (ar/en)

export const KCAL_TOLERANCE = 0.15;

export interface Per100Values {
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
}

export function expectedKcal(v: Pick<Per100Values, 'protein_per_100g' | 'carbs_per_100g' | 'fats_per_100g'>): number {
  return 4 * v.protein_per_100g + 4 * v.carbs_per_100g + 9 * v.fats_per_100g;
}

export interface ConsistencyResult {
  ok: boolean;
  expected: number;
  declared: number;
  deviationRatio: number;
}

export function checkKcalConsistency(v: Per100Values): ConsistencyResult {
  const expected = expectedKcal(v);
  const declared = v.calories_per_100g;
  if (expected === 0) {
    return { ok: declared === 0, expected, declared, deviationRatio: declared === 0 ? 0 : 1 };
  }
  const deviationRatio = Math.abs(declared - expected) / expected;
  return { ok: deviationRatio <= KCAL_TOLERANCE, expected, declared, deviationRatio };
}

// Normalize for FL-04 dedupe: trim, collapse spaces, lowercase latin,
// unify alef forms, strip Arabic diacritics (tashkeel).
export function normalizeFoodName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/[\u064B-\u0652\u0670]/g, '');
}

export interface NamePair {
  name_ar: string;
  name_en?: string | null;
}

export function isDuplicateName(candidate: NamePair, existing: NamePair): boolean {
  const candAr = normalizeFoodName(candidate.name_ar);
  if (existing.name_ar && normalizeFoodName(existing.name_ar) === candAr && candAr !== '') return true;
  const candEn = candidate.name_en ? normalizeFoodName(candidate.name_en) : '';
  if (candEn !== '' && existing.name_en && normalizeFoodName(existing.name_en) === candEn) return true;
  return false;
}

export interface ImportRow extends NamePair, Per100Values {
  category?: string | null;
  tags?: string[] | null;
  pairing_tags?: string[] | null;
}

export interface RowIssue {
  row: number;
  name: string;
  reason: string;
}

// Row-level validation shared by single-save (FL-14) and Excel import (FL-03/12).
// `visibleNames` = normalized names the actor may already see (global + own).
export function validateImportRow(
  row: ImportRow,
  rowNumber: number,
  visibleNames: NamePair[],
  seenInBatch: NamePair[]
): RowIssue | null {
  const label = row.name_ar?.trim() || row.name_en?.trim() || `row ${rowNumber}`;
  if (!row.name_ar || row.name_ar.trim() === '') {
    return { row: rowNumber, name: label, reason: 'Missing required field: name_ar' };
  }
  const nums: Array<[string, unknown]> = [
    ['calories_per_100g', row.calories_per_100g],
    ['protein_per_100g', row.protein_per_100g],
    ['carbs_per_100g', row.carbs_per_100g],
    ['fats_per_100g', row.fats_per_100g],
  ];
  for (const [field, value] of nums) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2000) {
      return { row: rowNumber, name: label, reason: `Missing or invalid field: ${field}` };
    }
  }
  const consistency = checkKcalConsistency(row as Per100Values);
  if (!consistency.ok) {
    return {
      row: rowNumber,
      name: label,
      reason: `kcal mismatch: declared ${consistency.declared} vs computed ${consistency.expected.toFixed(1)} from macros (tolerance ±15%)`,
    };
  }
  const pair: NamePair = { name_ar: row.name_ar, name_en: row.name_en ?? null };
  if (visibleNames.some((e) => isDuplicateName(pair, e)) || seenInBatch.some((e) => isDuplicateName(pair, e))) {
    return { row: rowNumber, name: label, reason: 'Duplicate: an item with the same name already exists (skipped)' };
  }
  return null;
}
