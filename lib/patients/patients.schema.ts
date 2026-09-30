import { z } from 'zod';

export const genderSchema = z.enum(['male', 'female']);
export const activitySchema = z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']);
export const goalSchema = z.enum(['lose', 'maintain', 'gain']);

export const patientCreateSchema = z.object({
  name_ar: z.string().min(2).max(255),
  name_en: z.string().max(255).optional().nullable(),
  gender: genderSchema,
  birth_date: z.string().date(),
  height_cm: z.number().int().positive().max(300),
  initial_weight_kg: z.number().positive().max(500),
  activity_level: activitySchema,
  goal: goalSchema,
  medical_notes: z.string().max(5000).optional().nullable(),
  chronic_conditions: z.array(z.string().max(100)).optional().nullable(),
  allergies: z.array(z.string().max(100)).optional().nullable(),
  consent_ai_sharing: z.boolean().optional(),
});

export const patientUpdateSchema = patientCreateSchema.partial().extend({
  current_weight_kg: z.number().positive().max(500).optional(),
});

export const patientListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().max(100).optional(),
  gender: genderSchema.optional(),
});

export const recalculateSchema = z.object({
  weight_kg: z.number().positive().max(500).optional(),
  height_cm: z.number().int().positive().max(300).optional(),
});

export type PatientCreateInput = z.infer<typeof patientCreateSchema>;
export type PatientUpdateInput = z.infer<typeof patientUpdateSchema>;
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;
