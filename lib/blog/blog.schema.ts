import { z } from 'zod';

export const blogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).optional(),
  category: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(120).optional(),
});

export const blogSlugSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

export type BlogListQuery = z.infer<typeof blogListQuerySchema>;
