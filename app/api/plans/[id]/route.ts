import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { planSaveSchema } from '@/lib/plans/editor.schema';
import { editorService } from '@/lib/plans/editor.service';
import { plansRepository } from '@/lib/db/repositories/plans.repo';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const plan = await editorService.getEditable(id, payload.sub);
  if (!plan) return notFound();
  return ok(plan);
}

// Transactional full-plan save + revision. Server recomputes every value
// authoritatively; client numbers are never trusted.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:plans:save`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = planSaveSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await editorService.save(id, payload.sub, parsed.data, isAdminRole(payload.role));
    if (!result) return notFound();
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'PLAN_SAVED',
      entityType: 'NutritionPlan',
      entityId: id,
      req: getRequestMeta(request),
      metadata: { revision_no: result.revisionNo, deviation_kcal: result.deviationKcal },
    });
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'ARCHIVED') return fail(code, (err as Error).message, 422);
    if (code === 'INVALID_FOOD') return fail(code, (err as Error).message, 400);
    if (code === 'PLAN_BLOCKED') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Plan save failed', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const plan = await plansRepository.findOwnedById(id, payload.sub);
  if (!plan) return notFound();
  await plansRepository.updateStatus(id, payload.sub, 'archived');
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'PLAN_ARCHIVED',
    entityType: 'NutritionPlan',
    entityId: id,
    req: getRequestMeta(request),
    metadata: {},
  });
  return ok({ archived: true });
}
