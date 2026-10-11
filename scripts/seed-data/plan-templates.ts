// P32-SEED — 8 global plan templates (nutrition).
//
//   balanced / keto / low-sodium / vegetarian  ×  1600 / 2200 kcal bands
//
// The snapshot shape is the production `TemplateSnapshot`
// (lib/templates/templates.service.ts:31-36). `templatesService.apply()` is
// self-contained: it scales grams, strips allergens, and re-reconciles using
// the snapshot's OWN `per100` macros — it never re-reads FoodItem. So each
// item below carries macros copied from the seeded food row, and `foodId`
// points at the real seeded FoodItem id so an applied plan links to it.
//
// Category slugs mirror the `templates` i18n namespace used in P16.

export interface TemplateFoodRef {
  /** name_en of a row in food-items.ts — resolved to a real foodId at run time. */
  key: string;
  grams: number;
}

export interface TemplateMeal {
  mealName: 'Breakfast' | 'Morning Snack' | 'Lunch' | 'Evening Snack' | 'Dinner';
  items: TemplateFoodRef[];
}

export interface TemplateDay {
  day: number;
  meals: TemplateMeal[];
}

export interface SeedTemplate {
  name: string;
  category: string;
  description: string;
  reference: { calories: number; proteinG: number; carbsG: number; fatsG: number };
  days: TemplateDay[];
}

export const SEED_TEMPLATES: SeedTemplate[] = [
  // ── Balanced 1600 ─────────────────────────────────────────────────────────
  {
    name: 'Balanced 1600 kcal',
    category: 'balanced',
    description: 'A moderate 1600 kcal day: roughly 25% protein, 50% carbohydrate, 25% fat. Suits most adults in a mild deficit.',
    reference: { calories: 1600, proteinG: 100, carbsG: 200, fatsG: 44 },
    days: [
      {
        day: 1,
        meals: [
          { mealName: 'Breakfast', items: [{ key: 'Rolled oats, dry', grams: 50 }, { key: 'Skim milk', grams: 200 }] },
          { mealName: 'Morning Snack', items: [{ key: 'Apple, raw', grams: 150 }] },
          {
            mealName: 'Lunch',
            items: [
              { key: 'Egyptian rice, cooked', grams: 150 },
              { key: 'Chicken breast, grilled', grams: 120 },
              { key: 'Broccoli, cooked', grams: 150 },
              { key: 'Olive oil', grams: 10 },
            ],
          },
          { mealName: 'Evening Snack', items: [{ key: 'Greek yogurt, plain', grams: 150 }] },
          {
            mealName: 'Dinner',
            items: [
              { key: 'Boiled potato', grams: 150 },
              { key: 'Tilapia, grilled', grams: 120 },
              { key: 'Zucchini, cooked', grams: 150 },
              { key: 'Olive oil', grams: 10 },
            ],
          },
        ],
      },
    ],
  },

  // ── Balanced 2200 ─────────────────────────────────────────────────────────
  {
    name: 'Balanced 2200 kcal',
    category: 'balanced',
    description: 'A maintenance-leaning 2200 kcal day for higher activity: same macro split, larger carbohydrate allowance.',
    reference: { calories: 2200, proteinG: 130, carbsG: 280, fatsG: 61 },
    days: [
      {
        day: 1,
        meals: [
          { mealName: 'Breakfast', items: [{ key: 'Sourdough bread', grams: 90 }, { key: 'Egg, boiled', grams: 100 }, { key: 'Clarified butter (ghee)', grams: 5 }] },
          { mealName: 'Morning Snack', items: [{ key: 'Banana, raw', grams: 120 }, { key: 'Greek yogurt, plain', grams: 150 }] },
          {
            mealName: 'Lunch',
            items: [
              { key: 'Basmati rice, cooked', grams: 200 },
              { key: 'Chicken breast, roasted', grams: 150 },
              { key: 'Carrot, raw', grams: 100 },
              { key: 'Olive oil', grams: 12 },
            ],
          },
          { mealName: 'Evening Snack', items: [{ key: 'Apple, raw', grams: 150 }] },
          {
            mealName: 'Dinner',
            items: [
              { key: 'Pasta, cooked', grams: 180 },
              { key: 'Lean minced beef, grilled', grams: 110 },
              { key: 'Spinach, raw', grams: 100 },
              { key: 'Olive oil', grams: 10 },
            ],
          },
        ],
      },
    ],
  },

  // ── Keto 1600 ─────────────────────────────────────────────────────────────
  {
    name: 'Keto 1600 kcal',
    category: 'keto',
    description: 'A very low-carbohydrate 1600 kcal day: ~30 g net carbohydrate, fat-dominant, moderate protein. For short-term clinical use under supervision.',
    reference: { calories: 1600, proteinG: 110, carbsG: 30, fatsG: 120 },
    days: [
      {
        day: 1,
        meals: [
          { mealName: 'Breakfast', items: [{ key: 'Egg, boiled', grams: 150 }, { key: 'Feta cheese', grams: 40 }, { key: 'Clarified butter (ghee)', grams: 8 }] },
          { mealName: 'Morning Snack', items: [{ key: 'Greek yogurt, plain', grams: 120 }] },
          {
            mealName: 'Lunch',
            items: [
              { key: 'Chicken breast, grilled', grams: 150 },
              { key: 'Spinach, raw', grams: 120 },
              { key: 'Olive oil', grams: 18 },
            ],
          },
          { mealName: 'Evening Snack', items: [{ key: 'Low-fat cottage cheese', grams: 120 }] },
          {
            mealName: 'Dinner',
            items: [
              { key: 'Tilapia, grilled', grams: 150 },
              { key: 'Zucchini, cooked', grams: 200 },
              { key: 'Olive oil', grams: 20 },
            ],
          },
        ],
      },
    ],
  },

  // ── Keto 2200 ─────────────────────────────────────────────────────────────
  {
    name: 'Keto 2200 kcal',
    category: 'keto',
    description: 'A higher-calorie keto day for athletes in a low-carbohydrate phase: ~35 g net carbohydrate with fat-dominant energy delivery.',
    reference: { calories: 2200, proteinG: 140, carbsG: 35, fatsG: 175 },
    days: [
      {
        day: 1,
        meals: [
          { mealName: 'Breakfast', items: [{ key: 'Egg, boiled', grams: 170 }, { key: 'Feta cheese', grams: 60 }, { key: 'Clarified butter (ghee)', grams: 10 }] },
          { mealName: 'Morning Snack', items: [{ key: 'Greek yogurt, plain', grams: 200 }] },
          {
            mealName: 'Lunch',
            items: [
              { key: 'Chicken breast, roasted', grams: 180 },
              { key: 'Broccoli, cooked', grams: 150 },
              { key: 'Olive oil', grams: 25 },
            ],
          },
          { mealName: 'Evening Snack', items: [{ key: 'Low-fat cottage cheese', grams: 150 }] },
          {
            mealName: 'Dinner',
            items: [
              { key: 'Lean minced beef, grilled', grams: 150 },
              { key: 'Spinach, raw', grams: 150 },
              { key: 'Olive oil', grams: 22 },
            ],
          },
        ],
      },
    ],
  },

  // ── Low-sodium 1600 ───────────────────────────────────────────────────────
  {
    name: 'Low-sodium 1600 kcal',
    category: 'low-sodium',
    description: 'A 1600 kcal day built from naturally low-sodium whole foods. Sodium is kept under ~1.2 g/day; useful for hypertension follow-up (NUT-03).',
    reference: { calories: 1600, proteinG: 105, carbsG: 195, fatsG: 47 },
    days: [
      {
        day: 1,
        meals: [
          { mealName: 'Breakfast', items: [{ key: 'Rolled oats, dry', grams: 50 }, { key: 'Skim milk', grams: 200 }, { key: 'Banana, raw', grams: 100 }] },
          { mealName: 'Morning Snack', items: [{ key: 'Apple, raw', grams: 150 }] },
          {
            mealName: 'Lunch',
            items: [
              { key: 'Egyptian rice, cooked', grams: 150 },
              { key: 'Chicken breast, grilled', grams: 120 },
              { key: 'Carrot, raw', grams: 100 },
              { key: 'Olive oil', grams: 10 },
            ],
          },
          { mealName: 'Evening Snack', items: [{ key: 'Canned tuna in water', grams: 80 }] },
          {
            mealName: 'Dinner',
            items: [
              { key: 'Boiled potato', grams: 180 },
              { key: 'Tilapia, grilled', grams: 130 },
              { key: 'Zucchini, cooked', grams: 150 },
              { key: 'Olive oil', grams: 8 },
            ],
          },
        ],
      },
    ],
  },

  // ── Low-sodium 2200 ───────────────────────────────────────────────────────
  {
    name: 'Low-sodium 2200 kcal',
    category: 'low-sodium',
    description: 'A 2200 kcal low-sodium day. Fresh legumes and unsalted fish replace salted bread, cheese and processed meat.',
    reference: { calories: 2200, proteinG: 135, carbsG: 265, fatsG: 66 },
    days: [
      {
        day: 1,
        meals: [
          { mealName: 'Breakfast', items: [{ key: 'Rolled oats, dry', grams: 70 }, { key: 'Skim milk', grams: 250 }, { key: 'Apple, raw', grams: 150 }] },
          { mealName: 'Morning Snack', items: [{ key: 'Lentils, boiled', grams: 120 }] },
          {
            mealName: 'Lunch',
            items: [
              { key: 'Basmati rice, cooked', grams: 200 },
              { key: 'Chicken breast, roasted', grams: 150 },
              { key: 'Broccoli, cooked', grams: 150 },
              { key: 'Olive oil', grams: 12 },
            ],
          },
          { mealName: 'Evening Snack', items: [{ key: 'Banana, raw', grams: 120 }] },
          {
            mealName: 'Dinner',
            items: [
              { key: 'Pasta, cooked', grams: 180 },
              { key: 'Canned tuna in water', grams: 120 },
              { key: 'Spinach, raw', grams: 150 },
              { key: 'Olive oil', grams: 10 },
            ],
          },
        ],
      },
    ],
  },

  // ── Vegetarian 1600 ───────────────────────────────────────────────────────
  {
    name: 'Vegetarian 1600 kcal',
    category: 'vegetarian',
    description: 'A fully vegetarian 1600 kcal day built on legumes, dairy and whole grains. Protein is spread across four sources.',
    reference: { calories: 1600, proteinG: 90, carbsG: 210, fatsG: 43 },
    days: [
      {
        day: 1,
        meals: [
          { mealName: 'Breakfast', items: [{ key: 'Rolled oats, dry', grams: 55 }, { key: 'Whole milk', grams: 200 }, { key: 'Banana, raw', grams: 100 }] },
          { mealName: 'Morning Snack', items: [{ key: 'Low-fat cottage cheese', grams: 150 }] },
          {
            mealName: 'Lunch',
            items: [
              { key: 'Egyptian rice, cooked', grams: 150 },
              { key: 'Chickpeas, boiled', grams: 150 },
              { key: 'Spinach, raw', grams: 120 },
              { key: 'Olive oil', grams: 12 },
            ],
          },
          { mealName: 'Evening Snack', items: [{ key: 'Apple, raw', grams: 150 }] },
          {
            mealName: 'Dinner',
            items: [
              { key: 'Boiled potato', grams: 180 },
              { key: 'Lentils, boiled', grams: 180 },
              { key: 'Zucchini, cooked', grams: 150 },
              { key: 'Olive oil', grams: 8 },
            ],
          },
        ],
      },
    ],
  },

  // ── Vegetarian 2200 ───────────────────────────────────────────────────────
  {
    name: 'Vegetarian 2200 kcal',
    category: 'vegetarian',
    description: 'A 2200 kcal vegetarian day with a higher protein target, useful for vegetarian strength or recovery phases.',
    reference: { calories: 2200, proteinG: 120, carbsG: 275, fatsG: 62 },
    days: [
      {
        day: 1,
        meals: [
          { mealName: 'Breakfast', items: [{ key: 'Sourdough bread', grams: 90 }, { key: 'Egg, boiled', grams: 100 }, { key: 'Greek yogurt, plain', grams: 150 }] },
          { mealName: 'Morning Snack', items: [{ key: 'Banana, raw', grams: 120 }, { key: 'Low-fat cottage cheese', grams: 100 }] },
          {
            mealName: 'Lunch',
            items: [
              { key: 'Basmati rice, cooked', grams: 200 },
              { key: 'Chickpeas, boiled', grams: 200 },
              { key: 'Carrot, raw', grams: 100 },
              { key: 'Olive oil', grams: 12 },
            ],
          },
          { mealName: 'Evening Snack', items: [{ key: 'Apple, raw', grams: 150 }] },
          {
            mealName: 'Dinner',
            items: [
              { key: 'Pasta, cooked', grams: 180 },
              { key: 'Fava beans, boiled', grams: 200 },
              { key: 'Broccoli, cooked', grams: 150 },
              { key: 'Olive oil', grams: 10 },
            ],
          },
        ],
      },
    ],
  },
];