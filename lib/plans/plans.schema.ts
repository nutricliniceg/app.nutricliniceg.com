import { z } from 'zod';

export const MEAL_NAMES = ['Breakfast', 'Morning Snack', 'Lunch', 'Evening Snack', 'Dinner'] as const;

export const planPreferencesSchema = z.object({
  cuisine: z.enum(['middle-eastern', 'mediterranean', 'general']).optional(),
  dislikes: z.string().trim().max(500).optional().nullable(),
  mealsPerDay: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
});

export const planGenerateSchema = z.object({
  patient_id: z.string().uuid(),
  mode: z.enum(['from_list', 'ai_free']),
  target_calories: z.number().int().min(800).max(6000).optional().nullable(),
  target_protein_g: z.number().min(0).max(500).optional().nullable(),
  target_carbs_g: z.number().min(0).max(800).optional().nullable(),
  target_fats_g: z.number().min(0).max(400).optional().nullable(),
  preferences: planPreferencesSchema.optional(),
  include_own_foods: z.boolean().optional(),
  ai_free_confirmed: z.boolean().optional(),
  week_number: z.number().int().min(1).max(520).optional(),
});

export const planListQuerySchema = z.object({
  patient_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// §8.2 from_list model output: the model picks food_ids + grams ONLY — every
// value is recomputed server-side from FoodItem (§8.2 note 3).
export const fromListOutputSchema = z.object({
  meals: z.array(z.object({
    meal_name: z.enum(MEAL_NAMES),
    items: z.array(z.object({
      food_id: z.string().min(1),
      grams: z.number().positive().max(2000),
    })).min(1).max(20),
  })).min(1).max(7),
});

// §8.7 ai_free model output: names + model-claimed values (verified later).
export const aiFreeOutputSchema = z.object({
  meals: z.array(z.object({
    meal_name: z.enum(MEAL_NAMES),
    items: z.array(z.object({
      food_name: z.string().trim().min(1).max(255),
      grams: z.number().positive().max(2000),
      protein_g: z.number().min(0).max(2000),
      carbs_g: z.number().min(0).max(2000),
      fats_g: z.number().min(0).max(2000),
      calories: z.number().min(0).max(20000),
    })).min(1).max(20),
  })).min(1).max(7),
});

export type PlanGenerateInput = z.infer<typeof planGenerateSchema>;
export type PlanPreferences = z.infer<typeof planPreferencesSchema>;
