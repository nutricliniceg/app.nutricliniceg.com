// P32-SEED — 30 global food items, per 100 g, realistic values.
//
// Calories are COMPUTED from the macros with Atwater factors
// (4P + 4C + 9F) rather than hand-typed. That is the definition of kcal, so
// the FL-09/FL-14 consistency gate (declared vs computed, ±15%) passes by
// construction instead of by hand-tuning — and stays correct if anyone edits
// a macro later.
//
// Values are rounded to USDA/Egyptian-Standard-Table magnitudes. No lorem,
// no placeholders. `category` must be one of FOOD_CATEGORIES and `tags` one of
// FOOD_TAGS (lib/foods/foods.schema.ts) — the service rejects anything else.

export interface SeedFood {
  name_ar: string;
  name_en: string;
  /** Protein g / 100 g */
  protein: number;
  /** Carbohydrate g / 100 g */
  carbs: number;
  /** Fat g / 100 g */
  fats: number;
  category:
    | 'protein'
    | 'starch'
    | 'vegetables'
    | 'fruit'
    | 'fats'
    | 'dairy'
    | 'legumes'
    | 'beverages'
    | 'snacks'
    | 'other';
  tags: string[];
  /** NUT-04 / NUT-03 minerals per 100 g. Optional in the write path. */
  potassium_mg?: number;
  phosphorus_mg?: number;
  sodium_mg?: number;
  added_sugar_g?: number;
}

/** Atwater general factors, kcal per gram. */
export const ATWATER = { protein: 4, carbs: 4, fats: 9 } as const;

export function kcalFromMacros(protein: number, carbs: number, fats: number): number {
  return Math.round(protein * ATWATER.protein + carbs * ATWATER.carbs + fats * ATWATER.fats);
}

export const SEED_FOODS: SeedFood[] = [
  // ── Staples & starches ────────────────────────────────────────────────────
  {
    name_ar: 'أرز مصري مسلوق',
    name_en: 'Egyptian rice, cooked',
    protein: 2.6, carbs: 28.2, fats: 0.3,
    category: 'starch', tags: ['vegan', 'vegetarian', 'gluten-free'],
    potassium_mg: 55, phosphorus_mg: 46, sodium_mg: 3, added_sugar_g: 0,
  },
  {
    name_ar: 'أرز بسمتي مسلوق',
    name_en: 'Basmati rice, cooked',
    protein: 2.7, carbs: 25.0, fats: 0.3,
    category: 'starch', tags: ['vegan', 'vegetarian', 'gluten-free'],
    potassium_mg: 43, phosphorus_mg: 43, sodium_mg: 1, added_sugar_g: 0,
  },
  {
    name_ar: 'عيش بلدي',
    name_en: 'Baladi whole-wheat bread',
    protein: 12.4, carbs: 41.0, fats: 3.4,
    category: 'starch', tags: ['vegan', 'vegetarian'],
    potassium_mg: 230, phosphorus_mg: 290, sodium_mg: 480, added_sugar_g: 0,
  },
  {
    name_ar: 'بطاطا مسلوقة',
    name_en: 'Boiled potato',
    protein: 1.9, carbs: 20.1, fats: 0.2,
    category: 'starch', tags: ['vegan', 'vegetarian', 'gluten-free'],
    potassium_mg: 379, phosphorus_mg: 44, sodium_mg: 4, added_sugar_g: 0,
  },
  {
    name_ar: 'شوفان جاف',
    name_en: 'Rolled oats, dry',
    protein: 16.9, carbs: 66.3, fats: 6.9,
    category: 'starch', tags: ['vegan', 'vegetarian'],
    potassium_mg: 429, phosphorus_mg: 477, sodium_mg: 6, added_sugar_g: 0,
  },
  {
    name_ar: 'معكرونة مسلوقة',
    name_en: 'Pasta, cooked',
    protein: 5.8, carbs: 31.0, fats: 0.9,
    category: 'starch', tags: ['vegan', 'vegetarian'],
    potassium_mg: 44, phosphorus_mg: 81, sodium_mg: 1, added_sugar_g: 0,
  },
  {
    name_ar: 'خبز سن',
    name_en: 'Sourdough bread',
    protein: 9.0, carbs: 48.0, fats: 1.8,
    category: 'starch', tags: ['vegan', 'vegetarian'],
    potassium_mg: 180, phosphorus_mg: 200, sodium_mg: 490, added_sugar_g: 0,
  },

  // ── Protein ───────────────────────────────────────────────────────────────
  {
    name_ar: 'صدر دجاج مشوي',
    name_en: 'Chicken breast, grilled',
    protein: 31.0, carbs: 0.0, fats: 3.6,
    category: 'protein', tags: ['gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 256, phosphorus_mg: 228, sodium_mg: 74, added_sugar_g: 0,
  },
  {
    name_ar: 'صدور دجاج مشوية',
    name_en: 'Chicken breast, roasted',
    protein: 30.6, carbs: 0.0, fats: 3.3,
    category: 'protein', tags: ['gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 271, phosphorus_mg: 224, sodium_mg: 82, added_sugar_g: 0,
  },
  {
    name_ar: 'لحم مفروم مشوي',
    name_en: 'Lean minced beef, grilled',
    protein: 26.1, carbs: 0.0, fats: 15.0,
    category: 'protein', tags: ['gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 318, phosphorus_mg: 201, sodium_mg: 72, added_sugar_g: 0,
  },
  {
    name_ar: 'سمك بلطي مشوي',
    name_en: 'Tilapia, grilled',
    protein: 26.0, carbs: 0.0, fats: 2.7,
    category: 'protein', tags: ['gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 380, phosphorus_mg: 242, sodium_mg: 56, added_sugar_g: 0,
  },
  {
    name_ar: 'تونة معلبة في مياه',
    name_en: 'Canned tuna in water',
    protein: 25.5, carbs: 0.0, fats: 0.8,
    category: 'protein', tags: ['gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 237, phosphorus_mg: 254, sodium_mg: 247, added_sugar_g: 0,
  },
  {
    name_ar: 'بيض مسلوق',
    name_en: 'Egg, boiled',
    protein: 12.6, carbs: 1.1, fats: 10.6,
    category: 'protein', tags: ['gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 126, phosphorus_mg: 191, sodium_mg: 124, added_sugar_g: 0,
  },

  // ── Legumes ───────────────────────────────────────────────────────────────
  {
    name_ar: 'عدس مسلوق',
    name_en: 'Lentils, boiled',
    protein: 9.0, carbs: 20.1, fats: 0.4,
    category: 'legumes', tags: ['vegan', 'vegetarian', 'gluten-free', 'nut-free'],
    potassium_mg: 369, phosphorus_mg: 266, sodium_mg: 4, added_sugar_g: 0,
  },
  {
    name_ar: 'فول مسلوق',
    name_en: 'Fava beans, boiled',
    protein: 8.9, carbs: 27.4, fats: 0.8,
    category: 'legumes', tags: ['vegan', 'vegetarian', 'gluten-free', 'nut-free'],
    potassium_mg: 436, phosphorus_mg: 146, sodium_mg: 6, added_sugar_g: 0,
  },
  {
    name_ar: 'حمص مسلوق',
    name_en: 'Chickpeas, boiled',
    protein: 8.9, carbs: 27.4, fats: 2.6,
    category: 'legumes', tags: ['vegan', 'vegetarian', 'gluten-free', 'nut-free'],
    potassium_mg: 291, phosphorus_mg: 228, sodium_mg: 32, added_sugar_g: 0,
  },
  {
    name_ar: 'عدس أحمر جاف',
    name_en: 'Red lentils, dry',
    protein: 24.6, carbs: 63.1, fats: 1.1,
    category: 'legumes', tags: ['vegan', 'vegetarian', 'gluten-free', 'nut-free'],
    potassium_mg: 731, phosphorus_mg: 630, sodium_mg: 7, added_sugar_g: 0,
  },

  // ── Dairy ─────────────────────────────────────────────────────────────────
  {
    name_ar: 'لبن كامل الدسم',
    name_en: 'Whole milk',
    protein: 3.2, carbs: 4.8, fats: 3.3,
    category: 'dairy', tags: ['vegetarian', 'gluten-free', 'nut-free'],
    potassium_mg: 150, phosphorus_mg: 104, sodium_mg: 44, added_sugar_g: 0,
  },
  {
    name_ar: 'لبن خالي الدسم',
    name_en: 'Skim milk',
    protein: 3.4, carbs: 5.0, fats: 0.1,
    category: 'dairy', tags: ['vegetarian', 'gluten-free', 'nut-free'],
    potassium_mg: 156, phosphorus_mg: 110, sodium_mg: 42, added_sugar_g: 0,
  },
  {
    name_ar: 'زبادي يوناني',
    name_en: 'Greek yogurt, plain',
    protein: 9.9, carbs: 3.6, fats: 5.0,
    category: 'dairy', tags: ['vegetarian', 'gluten-free', 'nut-free'],
    potassium_mg: 141, phosphorus_mg: 110, sodium_mg: 36, added_sugar_g: 0,
  },
  {
    name_ar: 'جبنة قريش',
    name_en: 'Low-fat cottage cheese',
    protein: 11.1, carbs: 3.4, fats: 1.8,
    category: 'dairy', tags: ['vegetarian', 'gluten-free', 'nut-free'],
    potassium_mg: 84, phosphorus_mg: 97, sodium_mg: 364, added_sugar_g: 0,
  },
  {
    name_ar: 'جبنة بيضاء',
    name_en: 'Feta cheese',
    protein: 14.2, carbs: 4.1, fats: 21.3,
    category: 'dairy', tags: ['vegetarian', 'gluten-free', 'nut-free'],
    potassium_mg: 62, phosphorus_mg: 493, sodium_mg: 917, added_sugar_g: 0,
  },

  // ── Vegetables ────────────────────────────────────────────────────────────
  {
    name_ar: 'بروكلي',
    name_en: 'Broccoli, cooked',
    protein: 2.8, carbs: 7.2, fats: 0.4,
    category: 'vegetables', tags: ['vegan', 'vegetarian', 'gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 293, phosphorus_mg: 66, sodium_mg: 33, added_sugar_g: 0,
  },
  {
    name_ar: 'كوسا',
    name_en: 'Zucchini, cooked',
    protein: 1.1, carbs: 3.8, fats: 0.3,
    category: 'vegetables', tags: ['vegan', 'vegetarian', 'gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 264, phosphorus_mg: 29, sodium_mg: 5, added_sugar_g: 0,
  },
  {
    name_ar: 'جزر',
    name_en: 'Carrot, raw',
    protein: 0.9, carbs: 9.6, fats: 0.2,
    category: 'vegetables', tags: ['vegan', 'vegetarian', 'gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 320, phosphorus_mg: 51, sodium_mg: 71, added_sugar_g: 0,
  },
  {
    name_ar: 'سبانخ',
    name_en: 'Spinach, raw',
    protein: 2.9, carbs: 3.6, fats: 0.4,
    category: 'vegetables', tags: ['vegan', 'vegetarian', 'gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 558, phosphorus_mg: 82, sodium_mg: 85, added_sugar_g: 0,
  },

  // ── Fruit ─────────────────────────────────────────────────────────────────
  {
    name_ar: 'تفاح',
    name_en: 'Apple, raw',
    protein: 0.3, carbs: 13.8, fats: 0.2,
    category: 'fruit', tags: ['vegan', 'vegetarian', 'gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 107, phosphorus_mg: 11, sodium_mg: 1, added_sugar_g: 0,
  },
  {
    name_ar: 'موز',
    name_en: 'Banana, raw',
    protein: 1.1, carbs: 22.8, fats: 0.3,
    category: 'fruit', tags: ['vegan', 'vegetarian', 'gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 358, phosphorus_mg: 22, sodium_mg: 1, added_sugar_g: 0,
  },

  // ── Fats ──────────────────────────────────────────────────────────────────
  {
    name_ar: 'زيت زيتون',
    name_en: 'Olive oil',
    protein: 0.0, carbs: 0.0, fats: 100.0,
    category: 'fats', tags: ['vegan', 'vegetarian', 'gluten-free', 'lactose-free', 'nut-free'],
    potassium_mg: 1, phosphorus_mg: 1, sodium_mg: 2, added_sugar_g: 0,
  },
  {
    name_ar: 'سمنة بلدي',
    name_en: 'Clarified butter (ghee)',
    protein: 0.0, carbs: 0.0, fats: 99.8,
    category: 'fats', tags: ['vegetarian', 'gluten-free', 'nut-free'],
    potassium_mg: 4, phosphorus_mg: 1, sodium_mg: 11, added_sugar_g: 0,
  },
];