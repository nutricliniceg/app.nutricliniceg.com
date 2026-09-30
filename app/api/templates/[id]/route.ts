import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { templatesRepository } from '@/lib/db/repositories/templates.repo';
import { templateUpdateSchema } from '@/lib/templates/templates.schema';
import { templatesService } from '@/lib/templates/templates.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:templates:get`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  const row = await templatesRepository.findVisibleById(id, payload.sub, isAdminRole(payload.role));
  if (!row) return notFound();
  return ok({
    id: row.id, name: row.name, category: row.category, description: row.description,
    is_global: row.is_global === true || row.is_global === 1, template_type: row.template_type,
    reference_calories: row.reference_calories, reference_protein_g: row.reference_protein_g,
    reference_carbs_g: row.reference_carbs_g, reference_fats_g: row.reference_fats_g,
    usage_count: row.usage_count,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:templates:update`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = templateUpdateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    await templatesService.updateTemplate(payload.sub, isAdminRole(payload.role), id, parsed.data);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'TEMPLATE_UPDATED',
      entityType: 'PlanTemplate', entityId: id, req: getRequestMeta(request), metadata: parsed.data,
    });
    return ok({ id });
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'FORBIDDEN') return fail('FORBIDDEN', 'Only admins can edit global templates', 403);
    return fail('INTERNAL_ERROR', 'Template update failed', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:templates:delete`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  try {
    await templatesService.removeTemplate(payload.sub, isAdminRole(payload.role), id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'TEMPLATE_ARCHIVED',
      entityType: 'PlanTemplate', entityId: id, req: getRequestMeta(request),
    });
    return ok({ id });
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'FORBIDDEN') return fail('FORBIDDEN', 'Only admins can archive global templates', 403);
    return fail('INTERNAL_ERROR', 'Template archive failed', 500);
  }
}
