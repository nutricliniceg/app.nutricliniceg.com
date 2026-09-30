import { z } from 'zod';

export const adminUsersQuerySchema = z.object({
  search: z.string().trim().max(255).optional(),
  role: z.enum(['doctor', 'admin', 'super_admin']).optional(),
  status: z.enum(['active', 'inactive', 'pending']).optional(),
  plan_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const adminUserPatchSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  clinic_name: z.string().trim().max(255).optional().nullable(),
  specialization: z.string().trim().max(255).optional().nullable(),
  is_active: z.boolean().optional(),
});

export const subscriptionAdjustSchema = z.object({
  plan_id: z.string().uuid().optional().nullable(),
  add_days: z.number().int().min(1).max(730).optional(),
  remove_days: z.number().int().min(1).max(730).optional(),
  reason: z.string().trim().min(3).max(500),
}).refine((v) => v.plan_id !== undefined || v.add_days !== undefined || v.remove_days !== undefined, {
  message: 'Nothing to adjust: provide plan_id, add_days, or remove_days',
});

export const activationBulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export const activationRejectSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const subscriptionPlanSchema = z.object({
  name_ar: z.string().trim().min(2).max(100),
  name_en: z.string().trim().min(2).max(100),
  description_ar: z.string().trim().max(2000).optional().nullable(),
  description_en: z.string().trim().max(2000).optional().nullable(),
  price_monthly: z.number().min(0).max(1000000),
  price_yearly: z.number().min(0).max(10000000).optional().nullable(),
  duration_days: z.number().int().min(1).max(3650),
  max_patients: z.number().int().min(1).max(1000000).optional().nullable(),
  max_ai_calls_monthly: z.number().int().min(1).max(10000000).optional().nullable(),
  features: z.unknown().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
});

export const subscriptionPlanPatchSchema = subscriptionPlanSchema.partial();

export const cmsVisibilitySchema = z.object({
  is_visible: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

export const cmsPageSchema = z.object({
  title_ar: z.string().trim().min(2).max(255).optional(),
  title_en: z.string().trim().max(255).optional().nullable(),
  content_ar: z.string().trim().min(1).max(200000).optional(),
  content_en: z.string().trim().max(200000).optional().nullable(),
});

export const settingSetSchema = z.object({
  value: z.unknown(),
});

export const testEmailSchema = z.object({
  to: z.string().trim().email().max(255),
});

export const bulkEmailSchema = z.object({
  alias: z.enum(['no-reply', 'info', 'admin']),
  audience: z.enum(['all', 'doctors', 'selected', 'admins']),
  user_ids: z.array(z.string().uuid()).max(5000).optional(),
  subject: z.string().trim().min(3).max(255),
  body: z.string().trim().min(1).max(50000),
  via_email: z.boolean().optional(),
  via_in_app: z.boolean().optional(),
}).refine((v) => (v.via_email ?? true) || (v.via_in_app ?? true), { message: 'At least one channel required' })
  .refine((v) => v.audience !== 'selected' || (v.user_ids && v.user_ids.length > 0), { message: 'Selected audience requires user_ids' });

export const errorResolveSchema = z.object({
  note: z.string().trim().max(2000).optional().nullable(),
});

export const errorListQuerySchema = z.object({
  level: z.enum(['error', 'warning', 'info']).optional(),
  source: z.string().trim().max(100).optional(),
  resolved: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const contactStatusSchema = z.object({
  status: z.enum(['new', 'read', 'replied', 'archived']),
  reply_text: z.string().trim().max(5000).optional().nullable(),
});

export const contactIntakeSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional().nullable(),
  subject: z.string().trim().max(255).optional().nullable(),
  message: z.string().trim().min(10).max(10000),
});

export const aiProviderPatchSchema = z.object({
  is_enabled: z.boolean().optional(),
  priority_order: z.number().int().min(1).max(100).optional(),
  base_url: z.string().trim().url().max(500).optional().nullable(),
  name: z.string().trim().min(2).max(100).optional(),
  data_retention: z.enum(['unknown', 'zero-retention', 'training-opt-out']).optional(),
});

export const aiReorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(20),
});

export const aiKeyCreateSchema = z.object({
  key: z.string().trim().min(8).max(5000),
  name: z.string().trim().max(100).optional().nullable(),
});

export const aiKeyMetaSchema = z.object({
  name: z.string().trim().max(100).optional().nullable(),
  is_active: z.boolean().optional(),
});

export const aiKeyRotateSchema = z.object({
  key: z.string().trim().min(8).max(5000),
});

export const aiUsageQuerySchema = z.object({
  provider_id: z.string().uuid().optional(),
  doctor_id: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  success: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const aiCostQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  top: z.coerce.number().int().min(1).max(50).optional(),
});

export const auditListQuerySchema = z.object({
  actor: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
  entity: z.string().trim().max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const turnstileSetSchema = z.object({
  enabled: z.boolean().optional(),
  site_key: z.string().trim().max(255).optional().nullable(),
  secret_key: z.string().trim().max(500).optional().nullable(),
});

export const passwordPolicySchema = z.object({
  minLength: z.number().int().min(8).max(128).optional(),
  requireUpper: z.boolean().optional(),
  requireDigit: z.boolean().optional(),
  requireSymbol: z.boolean().optional(),
  expiryDays: z.number().int().min(0).max(3650).optional(),
});
