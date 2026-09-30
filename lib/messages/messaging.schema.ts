import { z } from 'zod';

export const threadReplySchema = z.object({
  text: z.string().trim().max(2000).optional().nullable(),
  file_id: z.string().uuid().optional().nullable(),
}).refine((v) => (v.text?.trim() ?? '') !== '' || !!v.file_id, { message: 'Text or image required' });

export const threadListQuerySchema = z.object({
  include_archived: z.coerce.boolean().optional(),
});

export const portalThreadMessageSchema = z.object({
  text: z.string().trim().max(2000).optional().nullable(),
  file_id: z.string().uuid().optional().nullable(),
}).refine((v) => (v.text?.trim() ?? '') !== '' || !!v.file_id, { message: 'Text or image required' });

export type ThreadReplyInput = z.infer<typeof threadReplySchema>;
export type PortalThreadMessageInput = z.infer<typeof portalThreadMessageSchema>;
