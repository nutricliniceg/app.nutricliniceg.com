import { z } from 'zod';

export const clientErrorSchema = z.object({
  level: z.enum(['error', 'warning', 'info']).default('error'),
  source: z.string().max(100).default('client'),
  message: z.string().min(1).max(5000),
  path: z.string().max(500).optional(),
});

export type ClientErrorInput = z.infer<typeof clientErrorSchema>;
