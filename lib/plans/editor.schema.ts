import { z } from 'zod';

export const bulkScopeSchema = z.enum(['meal', 'day', 'week', 'all-weeks']);

export const bulkOpSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_grams'), grams: z.number().min(1).max(2000) }),
  z.object({ type: z.literal('swap_food'), food_id: z.string().min(1) }),
]);

export const planSaveItemSchema = z.object({
  id: z.string().optional(),
  food_id: z.string().min(1).optional().nullable(),
  food_name_ar: z.string().trim().max(255).optional().nullable(),
  food_name_en: z.string().trim().max(255).optional().nullable(),
  grams: z.number().min(1).max(2000),
});

export const planSaveMealSchema = z.object({
  day: z.number().int().min(1).max(7),
  meal_name: z.enum(['Breakfast', 'Morning Snack', 'Lunch', 'Evening Snack', 'Dinner']),
  items: z.array(planSaveItemSchema).min(1).max(20),
});

export const planSaveSchema = z.object({
  target_calories: z.number().int().min(800).max(6000).optional(),
  target_protein_g: z.number().min(0).max(500).optional(),
  target_carbs_g: z.number().min(0).max(800).optional(),
  target_fats_g: z.number().min(0).max(400).optional(),
  meals: z.array(planSaveMealSchema).min(1).max(35),
  change_note: z.string().trim().max(255).optional().nullable(),
});

export const bulkEditSchema = z.object({
  scope: bulkScopeSchema,
  anchor: z.object({
    meal_id: z.string().min(1).optional(),
    item_id: z.string().min(1).optional(),
    food_key: z.string().min(1).max(300).optional(),
  }),
  op: bulkOpSchema,
  exclusions: z.array(z.string().min(1)).max(500).optional(),
  preview: z.boolean().optional(),
  change_note: z.string().trim().max(255).optional().nullable(),
});

export const restoreRevisionSchema = z.object({
  revision_no: z.number().int().min(1),
});

export const cloneWeekSchema = z.object({
  week_number: z.number().int().min(1).max(520).optional().nullable(),
});

export type PlanSaveInput = z.infer<typeof planSaveSchema>;
export type BulkEditInput = z.infer<typeof bulkEditSchema>;
