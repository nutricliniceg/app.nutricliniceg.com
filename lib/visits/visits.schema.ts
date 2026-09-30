import { z } from 'zod';

export const visitCreateSchema = z.object({
  patient_id: z.string().uuid(),
  visit_date: z.string().date(),
  weight_kg: z.number().positive().max(500).optional().nullable(),
  body_fat_pct: z.number().min(0).max(100).optional().nullable(),
  muscle_mass_kg: z.number().min(0).max(300).optional().nullable(),
  water_pct: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const visitUpdateSchema = visitCreateSchema.omit({ patient_id: true }).partial();

export const visitListQuerySchema = z.object({
  patient_id: z.string().uuid(),
});

export type VisitCreateInput = z.infer<typeof visitCreateSchema>;
export type VisitUpdateInput = z.infer<typeof visitUpdateSchema>;
