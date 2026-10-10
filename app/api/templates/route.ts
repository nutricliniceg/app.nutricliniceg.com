import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { templateCreateSchema, templateListQuerySchema } from '@/lib/templates/templates.schema';
import { templatesService } from '@/lib/templates/templates.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:templates:list`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const parsed = templateListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const data = await templatesService.list(payload.sub, parsed.data);
  return ok({ templates: data });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:templates:create`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = templateCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await templatesService.createFromPlan(payload.sub, isAdminRole(payload.role), parsed.data);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'TEMPLATE_CREATED',
      entityType: 'PlanTemplate', entityId: result.id, req: getRequestMeta(request),
      metadata: { plan_id: parsed.data.plan_id, category: parsed.data.category },
    });
    return ok(result, undefined, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'FORBIDDEN') return fail('FORBIDDEN', 'Only admins can create global templates', 403);
    return fail('INTERNAL_ERROR', 'Template creation failed', 500);
  }
}
