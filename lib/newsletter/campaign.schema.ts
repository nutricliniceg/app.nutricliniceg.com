import { z } from 'zod';

export const campaignCreateSchema = z.object({
  subject: z.string().trim().min(1).max(255),
  body_html: z.string().trim().min(1).max(200000),
  body_text: z.string().trim().min(1).max(200000),
  locale: z.enum(['ar', 'en']),
  audience_rule: z.enum(['locale_exact', 'locale_with_fallback']).optional(),
  scheduled_at: z.string().datetime({ offset: true }).optional().nullable(),
});

export const campaignUpdateSchema = z.object({
  subject: z.string().trim().min(1).max(255).optional(),
  body_html: z.string().trim().min(1).max(200000).optional(),
  body_text: z.string().trim().min(1).max(200000).optional(),
  scheduled_at: z.string().datetime({ offset: true }).nullable().optional(),
});

export const campaignListQuerySchema = z.object({
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'failed']).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const campaignTestSchema = z.object({
  email: z.string().trim().email().max(255),
});

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
