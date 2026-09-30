import { z } from 'zod';

export const TEMPLATE_CATEGORIES = ['diet', 'diabetes', 'sport', 'vegetarian', 'pregnancy', 'general'] as const;
export const TEMPLATE_TYPES = ['nutrition', 'exercise'] as const;

export const templateCreateSchema = z.object({
  plan_id: z.string().uuid(),
  name: z.string().trim().min(3).max(255),
  category: z.enum(TEMPLATE_CATEGORIES),
  description: z.string().trim().max(2000).optional().nullable(),
  is_global: z.boolean().optional(),
});

export const templateListQuerySchema = z.object({
  search: z.string().trim().max(255).optional(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  type: z.enum(TEMPLATE_TYPES).optional(),
  sort: z.enum(['usage', 'recent']).optional(),
});

export const templateApplySchema = z.object({
  patient_id: z.string().uuid(),
  confirm_large_diff: z.boolean().optional(),
});

export const templateUpdateSchema = z.object({
  name: z.string().trim().min(3).max(255).optional(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const adaptiveSuggestSchema = z.object({
  patient_id: z.string().uuid(),
  source_plan_id: z.string().uuid().optional().nullable(),
});

export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;
export type TemplateListQuery = z.infer<typeof templateListQuerySchema>;
export type TemplateApplyInput = z.infer<typeof templateApplySchema>;
export type AdaptiveSuggestInput = z.infer<typeof adaptiveSuggestSchema>;
