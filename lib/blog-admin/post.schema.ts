import { z } from 'zod';

export const postStatusEnum = z.enum(['draft', 'scheduled', 'published', 'archived']);

export const postCreateSchema = z.object({
  locale: z.enum(['ar', 'en']),
  title: z.string().trim().min(2).max(255),
  slug: z.string().trim().max(200).optional().nullable(),
  excerpt: z.string().trim().max(400).optional().nullable(),
  content_md: z.string().trim().min(1).max(500000),
  featured_image: z.string().trim().max(500).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  tag_ids: z.array(z.string().uuid()).max(50).optional(),
  meta_title: z.string().trim().max(60).optional().nullable(),
  meta_desc: z.string().trim().max(160).optional().nullable(),
  og_image: z.string().trim().max(500).optional().nullable(),
  canonical_url: z.string().trim().url().max(500).optional().nullable(),
  noindex: z.boolean().optional(),
  guest_author: z.string().trim().max(255).optional().nullable(),
  translation_of: z.string().uuid().optional().nullable(),
  published_at: z.string().datetime({ offset: true }).optional().nullable(),
  send_newsletter: z.boolean().optional(),
});

export const postUpdateSchema = postCreateSchema.partial().extend({
  change_note: z.string().trim().max(255).optional().nullable(),
});

export const postListQuerySchema = z.object({
  status: postStatusEnum.optional(),
  untranslated: z.coerce.boolean().optional(),
  q: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const postBulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  op: z.enum(['publish', 'unpublish', 'archive', 'delete', 'change_category']),
  category_id: z.string().uuid().optional().nullable(),
});

export const postPublishSchema = z.object({
  published_at: z.string().datetime({ offset: true }).optional().nullable(),
});

export const revisionRestoreSchema = z.object({
  revision_no: z.number().int().min(1),
});

export const categorySchema = z.object({
  slug: z.string().trim().min(1).max(120),
  name_ar: z.string().trim().min(1).max(120),
  name_en: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(400).optional().nullable(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

export const tagSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  name_ar: z.string().trim().min(1).max(120),
  name_en: z.string().trim().max(120).optional().nullable(),
});

export const mediaUploadMetaSchema = z.object({
  alt_text: z.string().trim().min(2).max(255),
  folder: z.string().trim().max(120).optional().nullable(),
});

export const mediaListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  type: z.enum(['image', 'other']).optional(),
  folder: z.string().trim().max(120).optional(),
});

export const mediaPatchSchema = z.object({
  alt_text: z.string().trim().min(2).max(255).optional(),
  folder: z.string().trim().max(120).optional().nullable(),
});

export type PostCreateInput = z.infer<typeof postCreateSchema>;
export type PostUpdateInput = z.infer<typeof postUpdateSchema>;
