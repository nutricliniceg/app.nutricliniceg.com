import { z } from 'zod';

export const checkoutSchema = z.object({
  plan_id: z.string().uuid(),
  method: z.enum(['paymob', 'manual']),
});

export const manualPaySchema = z.object({
  plan_id: z.string().uuid(),
  method: z.enum(['manual', 'bank_transfer']),
  reference: z.string().trim().min(3).max(255),
});

export const manualReviewSchema = z.object({
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const trialGrantSchema = z.object({
  user_id: z.string().uuid(),
  days: z.number().int().min(1).max(90).optional(),
});

export const paymobWebhookSchema = z.object({
  hmac: z.string().min(1),
  obj: z.object({
    id: z.union([z.string(), z.number()]),
    success: z.boolean(),
    amount_cents: z.number(),
    currency: z.string().optional(),
    order: z.object({ id: z.union([z.string(), z.number()]).optional() }).passthrough().optional(),
    payment_key_claims: z.object({ extra: z.record(z.string(), z.unknown()).optional() }).passthrough().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
}).passthrough();

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ManualPayInput = z.infer<typeof manualPaySchema>;
