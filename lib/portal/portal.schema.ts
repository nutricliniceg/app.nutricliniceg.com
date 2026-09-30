import { z } from 'zod';

export const PORTAL_PERMISSIONS = ['view_plans', 'send_weight', 'send_note', 'message'] as const;
export const PORTAL_EXPIRIES = [7, 30, 60, 90] as const;

export const portalPermissionsSchema = z.object({
  view_plans: z.boolean(),
  send_weight: z.boolean(),
  send_note: z.boolean(),
  message: z.boolean(),
});

export const portalTokenCreateSchema = z.object({
  validity_days: z.union([z.literal(7), z.literal(30), z.literal(60), z.literal(90)]),
  permissions: portalPermissionsSchema,
  notify_email: z.string().trim().email().max(255).optional().nullable(),
});

export const portalWeightSchema = z.object({
  weight_kg: z.number().min(20).max(500),
  note: z.string().trim().max(500).optional().nullable(),
});

export const portalNoteSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const portalMessageSchema = z.object({
  text: z.string().trim().max(2000).optional().nullable(),
  file_id: z.string().uuid().optional().nullable(),
}).refine((v) => (v.text?.trim() ?? '') !== '' || !!v.file_id, { message: 'Text or image required' });

export type PortalPermissions = z.infer<typeof portalPermissionsSchema>;
export type PortalTokenCreateInput = z.infer<typeof portalTokenCreateSchema>;
