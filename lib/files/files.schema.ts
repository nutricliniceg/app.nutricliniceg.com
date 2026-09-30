import { z } from 'zod';

export const filePurposeSchema = z.enum(['inbody', 'lab', 'portal_message', 'avatar', 'blog', 'other']);

export const uploadMetaSchema = z.object({
  patient_id: z.string().uuid().optional(),
  purpose: filePurposeSchema.default('other'),
});

export type UploadMeta = z.infer<typeof uploadMetaSchema>;
