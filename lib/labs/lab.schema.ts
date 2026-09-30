import { z } from 'zod';

export const labAnalyzeSchema = z.object({
  patient_id: z.string().uuid(),
  file_id: z.string().uuid().optional(),
  text: z.string().max(8000).optional(),
}).refine((v) => v.file_id || v.text, { message: 'file_id or text is required' });

export type LabAnalyzeInput = z.infer<typeof labAnalyzeSchema>;
