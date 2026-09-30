import { z } from 'zod';

export const EXERCISE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const EXERCISE_GOALS = ['lose', 'maintain', 'gain', 'general'] as const;
export const EXERCISE_BULK_SCOPES = ['day', 'week', 'all-weeks'] as const;

const youtubeUrl = z.string().trim().max(500).url().optional().nullable();

export const exerciseGenerateSchema = z.object({
  patient_id: z.string().uuid(),
  goal: z.enum(EXERCISE_GOALS),
  level: z.enum(EXERCISE_LEVELS),
  equipment: z.string().trim().max(500).optional().nullable(),
  days_per_week: z.number().int().min(1).max(7),
  week_number: z.number().int().min(1).max(520).optional(),
});

// §8-like server validation for the model output: the model picks names +
// volumes ONLY; nothing is trusted beyond shape (volumes are clamped).
export const exerciseAiOutputSchema = z.object({
  days: z.array(z.object({
    day: z.number().int().min(1).max(7),
    exercises: z.array(z.object({
      name_ar: z.string().trim().min(1).max(255),
      name_en: z.string().trim().max(255).optional().nullable(),
      sets: z.number().int().min(1).max(20),
      reps: z.number().int().min(1).max(500),
      rest_seconds: z.number().int().min(0).max(900).optional().nullable(),
      youtube_url: youtubeUrl,
      notes: z.string().trim().max(1000).optional().nullable(),
    })).min(1).max(20),
  })).min(1).max(7),
});

export const exerciseItemSchema = z.object({
  id: z.string().uuid().optional(),
  name_ar: z.string().trim().min(1).max(255),
  name_en: z.string().trim().max(255).optional().nullable(),
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(1).max(500),
  rest_seconds: z.number().int().min(0).max(900).optional().nullable(),
  youtube_url: youtubeUrl,
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const exerciseSaveSchema = z.object({
  days: z.array(z.object({
    day: z.number().int().min(1).max(7),
    exercises: z.array(exerciseItemSchema).max(20),
  })).min(1).max(7),
  change_note: z.string().trim().max(255).optional().nullable(),
});

export const exerciseBulkOpSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_sets'), sets: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal('set_reps'), reps: z.number().int().min(1).max(500) }),
  z.object({ type: z.literal('set_rest'), rest_seconds: z.number().int().min(0).max(900) }),
]);

export const exerciseBulkSchema = z.object({
  scope: z.enum(EXERCISE_BULK_SCOPES),
  anchor: z.object({
    day: z.number().int().min(1).max(7).optional(),
    exercise_id: z.string().uuid().optional(),
    exercise_name: z.string().trim().min(1).max(255).optional(),
  }),
  op: exerciseBulkOpSchema,
  exclusions: z.array(z.string().uuid()).max(500).optional(),
  preview: z.boolean().optional(),
  change_note: z.string().trim().max(255).optional().nullable(),
});

export const exerciseCopyDaySchema = z.object({
  from_day: z.number().int().min(1).max(7),
  to_days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  to_week_numbers: z.array(z.number().int().min(1).max(520)).max(52).optional(),
  change_note: z.string().trim().max(255).optional().nullable(),
});

export const exerciseRestoreSchema = z.object({
  revision_no: z.number().int().min(1),
});

export const exerciseAdaptiveSchema = z.object({
  patient_id: z.string().uuid(),
  source_plan_id: z.string().uuid().optional().nullable(),
});

export const exerciseListQuerySchema = z.object({
  patient_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ExerciseGenerateInput = z.infer<typeof exerciseGenerateSchema>;
export type ExerciseSaveInput = z.infer<typeof exerciseSaveSchema>;
export type ExerciseBulkInput = z.infer<typeof exerciseBulkSchema>;
export type ExerciseCopyDayInput = z.infer<typeof exerciseCopyDaySchema>;
