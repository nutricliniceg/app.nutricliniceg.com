import { normalizeFoodName } from '@/lib/foods';
import { settingsRepository } from '@/lib/db/repositories/settings.repo';

// §8.4 Culinary Pairing Matrix. The HARD rule (fish/seafood + egg/dairy in
// one meal) is fixed in code; WARNING rules are admin-editable via
// `nutrition.pairing_rules`. The model's `culinary_pairings_valid` claim is
// ALWAYS re-verified server-side and ignored on conflict.

export interface PairingItem {
  foodId: string | null;
  nameAr: string;
  nameEn?: string | null;
  category?: string | null;
  tags?: string[] | null;
  pairingTags?: string[] | null;
}

export interface WarningRuleToggles {
  teaCoffeeWithIron: boolean;
  citrusWithDairy: boolean;
  doubleHeavyProtein: boolean;
}

export const DEFAULT_WARNING_RULES: WarningRuleToggles = {
  teaCoffeeWithIron: true,
  citrusWithDairy: true,
  doubleHeavyProtein: true,
};

export async function getPairingWarningRules(): Promise<WarningRuleToggles> {
  try {
    const override = await settingsRepository.get<Partial<WarningRuleToggles>>('nutrition.pairing_rules');
    if (override && typeof override === 'object') return { ...DEFAULT_WARNING_RULES, ...override };
  } catch {
    // Settings unavailable — baked defaults apply.
  }
  return { ...DEFAULT_WARNING_RULES };
}

const WORDS = {
  fish: ['سمك', 'تونة', 'سلمون', 'سردين', 'جمبري', 'مأكولات بحرية', 'fish', 'tuna', 'salmon', 'sardine', 'shrimp', 'seafood'],
  egg: ['بيض', 'egg'],
  dairy: ['حليب', 'لبن', 'زبادي', 'يوجورت', 'جبن', 'جبنة', 'قشطة', 'زبدة', 'رائب', 'milk', 'dairy', 'yogurt', 'cheese', 'butter'],
  teaCoffee: ['شاي', 'قهوة', 'tea', 'coffee'],
  iron: ['كبدة', 'لحوم حمراء', 'عدس', 'سبانخ', 'iron', 'liver', 'lentils', 'spinach', 'red meat', 'high-iron'],
  citrus: ['برتقال', 'ليمون', 'يوسفي', 'جريب فروت', 'غريبفروت', 'orange', 'lemon', 'citrus', 'grapefruit'],
  heavyProtein: ['لحم', 'لحوم', 'دجاج', 'فراخ', 'beef', 'chicken', 'meat', 'steak'],
};

interface Classified {
  item: PairingItem;
  fish: boolean;
  egg: boolean;
  dairy: boolean;
  teaCoffee: boolean;
  iron: boolean;
  citrus: boolean;
  heavyProtein: boolean;
}

function mentions(haystack: string, words: string[]): boolean {
  const norm = normalizeFoodName(haystack);
  return words.some((w) => {
    const t = normalizeFoodName(w);
    return norm !== '' && t !== '' && (norm.includes(t) || t.includes(norm));
  });
}

function tagHas(item: PairingItem, words: string[]): boolean {
  const tags = [...(item.tags ?? []), ...(item.pairingTags ?? [])].map(normalizeFoodName);
  return words.some((w) => tags.includes(normalizeFoodName(w)));
}

function classify(item: PairingItem): Classified {
  const haystack = `${item.nameAr} ${item.nameEn ?? ''} ${item.category ?? ''}`;
  const fish = mentions(haystack, WORDS.fish) || tagHas(item, ['fish', 'seafood']);
  return {
    item,
    fish,
    egg: mentions(haystack, WORDS.egg) || tagHas(item, ['egg']),
    dairy: mentions(haystack, WORDS.dairy) || tagHas(item, ['dairy']),
    teaCoffee: mentions(haystack, WORDS.teaCoffee),
    iron: mentions(haystack, WORDS.iron) || tagHas(item, ['iron', 'high-iron']),
    citrus: mentions(haystack, WORDS.citrus) || tagHas(item, ['citrus']),
    heavyProtein: fish || mentions(haystack, WORDS.heavyProtein),
  };
}

export interface PairingVerdict {
  valid: boolean;
  hardViolations: string[];
  warnings: string[];
}

export function validateMealPairings(items: PairingItem[], rules: WarningRuleToggles = DEFAULT_WARNING_RULES): PairingVerdict {
  const verdict: PairingVerdict = { valid: true, hardViolations: [], warnings: [] };
  const classified = items.map(classify);
  const names = (list: Classified[]): string => list.map((c) => c.item.nameAr).join('، ');

  // HARD (§8.4): fish/seafood + egg or dairy in the same meal.
  const fish = classified.filter((c) => c.fish);
  const eggDairy = classified.filter((c) => c.egg || c.dairy);
  if (fish.length > 0 && eggDairy.length > 0) {
    verdict.valid = false;
    verdict.hardViolations.push(
      `Fish/seafood (${names(fish)}) must not share a meal with egg/dairy (${names(eggDairy)}).`
    );
  }

  if (rules.teaCoffeeWithIron) {
    const tea = classified.filter((c) => c.teaCoffee);
    const iron = classified.filter((c) => c.iron);
    if (tea.length > 0 && iron.length > 0) {
      verdict.warnings.push(
        `Tea/coffee (${names(tea)}) near an iron source (${names(iron)}) — advise 2h separation for iron absorption.`
      );
    }
  }
  if (rules.citrusWithDairy) {
    const citrus = classified.filter((c) => c.citrus);
    const dairy = classified.filter((c) => c.dairy);
    if (citrus.length > 0 && dairy.length > 0) {
      verdict.warnings.push(`Citrus (${names(citrus)}) combined with dairy (${names(dairy)}) may upset sensitive stomachs.`);
    }
  }
  if (rules.doubleHeavyProtein) {
    const heavy = classified.filter((c) => c.heavyProtein);
    if (heavy.length >= 2) {
      verdict.warnings.push(`Two heavy animal proteins in one meal (${names(heavy)}) — consider lightening one.`);
    }
  }
  return verdict;
}
