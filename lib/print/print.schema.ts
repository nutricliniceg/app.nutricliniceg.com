import { z } from 'zod';

export const brandingUpdateSchema = z.object({
  clinic_name: z.string().trim().max(255).optional().nullable(),
  clinic_logo_file_id: z.string().uuid().optional().nullable(),
});

export const showCaloriesSchema = z.object({
  show_calories_to_patient: z.boolean(),
});

export const printLinkCreateSchema = z.object({
  plan_type: z.enum(['nutrition', 'exercise']),
  plan_id: z.string().uuid(),
});

export const printQuerySchema = z.object({
  key: z.string().min(1).max(2000).optional(),
  locale: z.enum(['ar', 'en']).optional(),
});

export type BrandingUpdateInput = z.infer<typeof brandingUpdateSchema>;
export type ShowCaloriesInput = z.infer<typeof showCaloriesSchema>;
export type PrintLinkCreateInput = z.infer<typeof printLinkCreateSchema>;
