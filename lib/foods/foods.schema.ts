import { z } from 'zod';

// FL-05/06: fixed category + tag vocabularies (admin-verified values for NUT guards).
export const FOOD_CATEGORIES = [
  'protein',
  'starch',
  'vegetables',
  'fruit',
  'fats',
  'dairy',
  'legumes',
  'beverages',
  'snacks',
  'other',
] as const;

export const FOOD_TAGS = ['vegan', 'vegetarian', 'gluten-free', 'lactose-free', 'nut-free'] as const;

const per100 = z.number().min(0).max(2000);

export const foodCreateSchema = z.object({
  name_ar: z.string().trim().min(1).max(255),
  name_en: z.string().trim().max(255).optional().nullable(),
  calories_per_100g: per100,
  protein_per_100g: per100,
  carbs_per_100g: per100,
  fats_per_100g: per100,
  category: z.enum(FOOD_CATEGORIES).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().nullable(),
  pairing_tags: z.array(z.string().trim().min(1).max(60)).max(30).optional().nullable(),
});

export const foodUpdateSchema = foodCreateSchema.partial();

export const foodListQuerySchema = z.object({
  search: z.string().max(255).optional(),
  category: z.enum(FOOD_CATEGORIES).optional(),
  tag: z.string().max(40).optional(),
  scope: z.enum(['all', 'global', 'mine']).optional(),
  include_archived: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const foodListCreateSchema = z.object({
  name_ar: z.string().trim().min(1).max(255),
  name_en: z.string().trim().max(255).optional().nullable(),
  description_ar: z.string().max(2000).optional().nullable(),
  description_en: z.string().max(2000).optional().nullable(),
  food_ids: z.array(z.string().uuid()).max(500).optional(),
});

export const foodListUpdateSchema = foodListCreateSchema.partial();

// FL-15/16: doctor request-a-food-item payload (same per-100g core as foods).
export const foodRequestCreateSchema = z.object({
  name_ar: z.string().trim().min(1).max(255),
  name_en: z.string().trim().max(255).optional().nullable(),
  calories_per_100g: per100,
  protein_per_100g: per100,
  carbs_per_100g: per100,
  fats_per_100g: per100,
  category: z.enum(FOOD_CATEGORIES).optional().nullable(),
});

export const foodRequestReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const foodImportScopeSchema = z.object({
  scope: z.enum(['global', 'mine']).optional(),
});

export type FoodCreateInput = z.infer<typeof foodCreateSchema>;
export type FoodUpdateInput = z.infer<typeof foodUpdateSchema>;
export type FoodListQuery = z.infer<typeof foodListQuerySchema>;
export type FoodListCreateInput = z.infer<typeof foodListCreateSchema>;
export type FoodRequestCreateInput = z.infer<typeof foodRequestCreateSchema>;
export type FoodRequestReviewInput = z.infer<typeof foodRequestReviewSchema>;
