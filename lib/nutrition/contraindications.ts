import { settingsRepository } from '@/lib/db/repositories/settings.repo';

// NUT-03: contraindication caps enforced AFTER the reconciler, BEFORE save.
// Clinical defaults below are conservative, documented, and admin-overridable
// via SystemSettings `nutrition.contra_rules` (partial merge). Sources:
// protein 0.8 g/kg CKD (KDOQI conservative); K 2000mg / P 800-1000mg /
// Na 2000mg CKD & liver-ascites practice; added sugar 25g/day (AHA).
// Unknown mineral data never blocks — it forces doctor review instead.

export type ChronicCondition = 'kidney' | 'liver' | 'diabetes' | 'pregnancy' | 'lactation';

export interface ContraCap {
  proteinGPerKgIdeal?: number;
  potassiumMg?: number;
  phosphorusMg?: number;
  sodiumMg?: number;
  addedSugarG?: number;
  hardBlock: boolean;
  noAutoSuggest?: boolean;
  note: string;
}

export const DEFAULT_CONTRA_RULES: Record<ChronicCondition, ContraCap> = {
  kidney: {
    proteinGPerKgIdeal: 0.8,
    potassiumMg: 2000,
    phosphorusMg: 1000,
    sodiumMg: 2000,
    addedSugarG: 25,
    hardBlock: true,
    noAutoSuggest: true,
    note: 'Kidney disease — protein/potassium/phosphorus/sodium restricted; no auto-suggested values (§8.5).',
  },
  liver: {
    proteinGPerKgIdeal: 1.5,
    sodiumMg: 2000,
    addedSugarG: 25,
    hardBlock: true,
    note: 'Liver disease — sodium restricted; protein capped.',
  },
  diabetes: {
    addedSugarG: 25,
    sodiumMg: 2300,
    hardBlock: true,
    note: 'Diabetes — added sugar capped; carbohydrate distribution needs review.',
  },
  pregnancy: {
    addedSugarG: 25,
    sodiumMg: 2300,
    hardBlock: false,
    note: 'Pregnancy — increased needs; mandatory doctor review, warnings only.',
  },
  lactation: {
    addedSugarG: 25,
    sodiumMg: 2300,
    hardBlock: false,
    note: 'Lactation — increased needs; mandatory doctor review, warnings only.',
  },
};

export interface DayTotals {
  proteinG: number;
  potassiumMg: number | null;
  phosphorusMg: number | null;
  sodiumMg: number | null;
  addedSugarG: number | null;
}

export interface ContraVerdict {
  blocks: string[];
  warnings: string[];
  needsReview: boolean;
  noAutoSuggest: boolean;
}

export function normalizeCondition(raw: string): ChronicCondition | null {
  const c = raw.toLowerCase().trim();
  if (c === 'kidney' || c === 'كلى' || c === 'الكلى') return 'kidney';
  if (c === 'liver' || c === 'كبد' || c === 'الكبد') return 'liver';
  if (c === 'diabetes' || c === 'سكري' || c === 'السكري') return 'diabetes';
  if (c === 'pregnancy' || c === 'حمل' || c === 'الحمل') return 'pregnancy';
  if (c === 'lactation' || c === 'رضاعة' || c === 'الرضاعة') return 'lactation';
  return null;
}

export async function getContraRules(): Promise<Record<ChronicCondition, ContraCap>> {
  try {
    const override = await settingsRepository.get<Partial<Record<ChronicCondition, Partial<ContraCap>>>>('nutrition.contra_rules');
    if (override && typeof override === 'object') {
      const merged = { ...DEFAULT_CONTRA_RULES } as Record<ChronicCondition, ContraCap>;
      for (const [key, value] of Object.entries(override)) {
        const condition = normalizeCondition(key);
        if (condition && value && typeof value === 'object') {
          merged[condition] = { ...merged[condition], ...value };
        }
      }
      return merged;
    }
  } catch {
    // Settings unavailable — baked defaults apply.
  }
  return { ...DEFAULT_CONTRA_RULES };
}

export function checkContraindications(
  totals: DayTotals,
  conditions: string[],
  idealWeightKg: number,
  rules: Record<ChronicCondition, ContraCap> = DEFAULT_CONTRA_RULES
): ContraVerdict {
  const verdict: ContraVerdict = { blocks: [], warnings: [], needsReview: false, noAutoSuggest: false };
  const known = conditions.map(normalizeCondition).filter((c): c is ChronicCondition => c !== null);
  if (known.length === 0) return verdict;
  verdict.needsReview = true;

  const unknownMinerals: string[] = [];
  if (totals.potassiumMg === null) unknownMinerals.push('potassium');
  if (totals.phosphorusMg === null) unknownMinerals.push('phosphorus');
  if (totals.sodiumMg === null) unknownMinerals.push('sodium');
  if (totals.addedSugarG === null) unknownMinerals.push('added sugar');

  for (const condition of known) {
    const rule = rules[condition];
    if (rule.noAutoSuggest) verdict.noAutoSuggest = true;
    const report = (msg: string): void => {
      if (rule.hardBlock) verdict.blocks.push(`[${condition}] ${msg}`);
      else verdict.warnings.push(`[${condition}] ${msg}`);
    };
    if (rule.proteinGPerKgIdeal !== undefined) {
      const cap = rule.proteinGPerKgIdeal * idealWeightKg;
      if (totals.proteinG > cap) {
        report(`protein ${totals.proteinG.toFixed(1)}g exceeds cap ${cap.toFixed(1)}g (${rule.proteinGPerKgIdeal}g/kg ideal weight)`);
      }
    }
    const minerals: Array<[number | null, number | undefined, string, string]> = [
      [totals.potassiumMg, rule.potassiumMg, 'potassium', 'mg'],
      [totals.phosphorusMg, rule.phosphorusMg, 'phosphorus', 'mg'],
      [totals.sodiumMg, rule.sodiumMg, 'sodium', 'mg'],
      [totals.addedSugarG, rule.addedSugarG, 'added sugar', 'g'],
    ];
    for (const [actual, cap, label, unit] of minerals) {
      if (cap === undefined) continue;
      if (actual === null) continue; // handled as unknown-data warning below
      if (actual > cap) report(`${label} ${actual.toFixed(0)}${unit} exceeds cap ${cap}${unit}`);
    }
  }
  if (unknownMinerals.length > 0) {
    verdict.warnings.push(
      `Mineral data unavailable for: ${unknownMinerals.join(', ')} — mineral caps could not be verified, doctor review required.`
    );
  }
  return verdict;
}

// NUT-04: drug–food interactions — warnings to the doctor, NEVER blocks.
const DRUG_FOOD_MAP: Array<{ meds: string[]; foods: string[]; advice: string }> = [
  {
    meds: ['warfarin', 'وارفارين'],
    foods: ['spinach', 'kale', 'broccoli', 'سبانخ', 'جرجير', 'بروكلي', 'vitamin k'],
    advice: 'Vitamin-K greens may reduce warfarin effect — keep intake consistent and monitor INR.',
  },
  {
    meds: ['statin', 'ستاتين', 'atorvastatin', 'simvastatin'],
    foods: ['grapefruit', 'جريب فروت', 'غريبفروت'],
    advice: 'Grapefruit raises statin blood levels — avoid or keep strictly consistent.',
  },
];

export function checkDrugFoodInteractions(
  medications: string[],
  itemNames: Array<{ nameAr: string; nameEn?: string | null }>
): string[] {
  const warnings: string[] = [];
  const meds = medications.map((m) => m.toLowerCase().trim()).filter(Boolean);
  if (meds.length === 0) return warnings;
  const haystack = itemNames.map((i) => `${i.nameAr} ${i.nameEn ?? ''}`.toLowerCase()).join(' | ');
  for (const entry of DRUG_FOOD_MAP) {
    if (!entry.meds.some((m) => meds.some((med) => med.includes(m)))) continue;
    const hit = entry.foods.find((f) => haystack.includes(f.toLowerCase()));
    if (hit) warnings.push(`Drug–food interaction: ${entry.advice} (matched "${hit}")`);
  }
  return warnings;
}
