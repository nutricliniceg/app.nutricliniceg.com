import { normalizeFoodName } from '@/lib/foods';
import { settingsRepository } from '@/lib/db/repositories/settings.repo';

// NUT-01/NUT-02: allergy guard. Patient `allergies` (JSON) are matched against
// item names + tags through an admin-managed synonym table
// (`nutrition.allergy_synonyms`, merged over baked defaults). Matches are
// REMOVED pre-draft; saving a plan that still contains one is HARD-BLOCKED.

export interface GuardItem {
  foodId: string | null;
  nameAr: string;
  nameEn?: string | null;
  tags?: string[] | null;
}

// Baked defaults (Arabic-first). Admins extend/override via settings.
export const DEFAULT_ALLERGY_SYNONYMS: Record<string, string[]> = {
  'حليب': ['لبن', 'زبادي', 'يوجورت', 'جبن', 'جبنة', 'زبدة', 'قشطة', 'رائب', 'milk', 'dairy', 'yogurt', 'cheese', 'butter'],
  'بيض': ['egg', 'eggs'],
  'فول سوداني': ['peanut', 'فستق العبيد'],
  'مكسرات': ['لوز', 'جوز', 'بندق', 'كاجو', 'فستق', 'nuts', 'almond', 'walnut', 'cashew'],
  'قمح': ['جلوتين', 'wheat', 'gluten'],
  'سمك': ['تونة', 'سلمون', 'سردين', 'مأكولات بحرية', 'fish', 'tuna', 'salmon', 'seafood'],
  'جمبري': ['قشريات', 'shrimp', 'shellfish'],
  'صويا': ['soy', 'soya'],
};

export async function getAllergySynonyms(): Promise<Record<string, string[]>> {
  try {
    const override = await settingsRepository.get<Record<string, string[]>>('nutrition.allergy_synonyms');
    if (override && typeof override === 'object') {
      const merged: Record<string, string[]> = { ...DEFAULT_ALLERGY_SYNONYMS };
      for (const [key, value] of Object.entries(override)) {
        if (Array.isArray(value)) merged[key] = value.map(String);
      }
      return merged;
    }
  } catch {
    // Settings unavailable — baked defaults apply.
  }
  return { ...DEFAULT_ALLERGY_SYNONYMS };
}

function expandAllergy(allergy: string, synonyms: Record<string, string[]>): string[] {
  const norm = normalizeFoodName(allergy);
  const terms = new Set<string>([norm]);
  for (const [key, values] of Object.entries(synonyms)) {
    const normKey = normalizeFoodName(key);
    const normValues = values.map(normalizeFoodName);
    if (normKey === norm || normValues.includes(norm)) {
      terms.add(normKey);
      for (const v of normValues) terms.add(v);
    }
  }
  // Unknown allergies still match literally (normalized substring).
  return [...terms].filter((t) => t !== '');
}

export function itemMatchesAllergy(item: GuardItem, allergy: string, synonyms: Record<string, string[]>): boolean {
  const terms = expandAllergy(allergy, synonyms);
  if (terms.length === 0) return false;
  const haystacks = [normalizeFoodName(item.nameAr), item.nameEn ? normalizeFoodName(item.nameEn) : ''];
  const tags = (item.tags ?? []).map(normalizeFoodName);
  for (const term of terms) {
    if (haystacks.some((h) => h !== '' && (h.includes(term) || term.includes(h)))) return true;
    if (tags.some((t) => t === term || t.includes(term) || term.includes(t))) return true;
  }
  return false;
}

export interface StripResult<T extends GuardItem> {
  clean: T[];
  removed: Array<{ item: T; allergy: string }>;
}

// Pre-draft removal: matching items never reach the doctor's draft review.
export function stripAllergens<T extends GuardItem>(items: T[], allergies: string[], synonyms: Record<string, string[]>): StripResult<T> {
  const clean: T[] = [];
  const removed: Array<{ item: T; allergy: string }> = [];
  for (const item of items) {
    const hit = allergies.find((a) => a.trim() !== '' && itemMatchesAllergy(item, a, synonyms));
    if (hit) removed.push({ item, allergy: hit });
    else clean.push(item);
  }
  return { clean, removed };
}

// Save-time gate: HARD-BLOCK any plan still containing an allergen.
export function assertNoAllergens<T extends GuardItem>(items: T[], allergies: string[], synonyms: Record<string, string[]>): string[] {
  const violations: string[] = [];
  for (const item of items) {
    for (const allergy of allergies) {
      if (allergy.trim() !== '' && itemMatchesAllergy(item, allergy, synonyms)) {
        violations.push(`"${item.nameAr}" matches allergy "${allergy}" — saving is blocked`);
      }
    }
  }
  return violations;
}
