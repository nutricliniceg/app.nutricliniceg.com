import { z } from 'zod';

export const subscribeSchema = z.object({
  email: z.string().trim().email().max(255),
  name: z.string().trim().max(255).optional().nullable(),
  locale: z.enum(['ar', 'en']).optional(),
  source: z.enum(['footer', 'blog', 'landing', 'manual', 'import']).optional(),
  turnstile_token: z.string().optional(),
  // Honeypot: real users leave it empty; bots fill it (NL-04).
  website: z.string().max(500).optional().nullable(),
});

export const subscriberAddSchema = z.object({
  email: z.string().trim().email().max(255),
  name: z.string().trim().max(255).optional().nullable(),
  locale: z.enum(['ar', 'en']).optional(),
});

export const subscriberListQuerySchema = z.object({
  status: z.enum(['pending', 'confirmed', 'unsubscribed', 'bounced']).optional(),
  locale: z.enum(['ar', 'en']).optional(),
  q: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
