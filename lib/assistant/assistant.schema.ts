import { z } from 'zod';

export const conversationListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  archived: z.coerce.boolean().optional(),
  patient_id: z.string().uuid().optional().nullable(),
  trash: z.coerce.boolean().optional(),
});

export const conversationCreateSchema = z.object({
  title: z.string().trim().max(255).optional().nullable(),
  patient_id: z.string().uuid().optional().nullable(),
});

export const conversationPatchSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  is_pinned: z.boolean().optional(),
  is_archived: z.boolean().optional(),
});

export const conversationSendSchema = z.object({
  content: z.string().trim().min(1).max(12000),
  file_ids: z.array(z.string().uuid()).max(5).optional(),
});

export const conversationLinkSchema = z.object({
  patient_id: z.string().uuid(),
  confirmed: z.boolean().optional(),
});

export const labAnalyzeRequestSchema = z.object({
  patient_id: z.string().uuid(),
  text: z.string().trim().min(1).max(12000).optional().nullable(),
  file_id: z.string().uuid().optional().nullable(),
}).refine((v) => (v.text?.trim() ?? '') !== '' || !!v.file_id, { message: 'Text or file required' });

export type ConversationSendInput = z.infer<typeof conversationSendSchema>;
