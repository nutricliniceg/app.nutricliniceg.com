import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { templateApplySchema } from '@/lib/templates/templates.schema';
import { templatesService } from '@/lib/templates/templates.service';
import { generationErrorCode, generationErrorExtra } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:templates:apply`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = templateApplySchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await templatesService.applyToPatient(payload.sub, id, parsed.data);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'TEMPLATE_APPLIED',
      entityType: 'PlanTemplate', entityId: id, req: getRequestMeta(request),
      metadata: { patient_id: parsed.data.patient_id, plan_id: result.planId, removed: result.removed.length },
    });
    return ok(result, { message: 'Draft plan created from template — doctor approval required' }, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'NEEDS_CONFIRMATION') {
      const extra = generationErrorExtra(err);
      return fail(code, (err as Error).message, 422, { confirm: ['confirm_large_diff'], extra: extra ? [JSON.stringify(extra)] : [] });
    }
    return fail('INTERNAL_ERROR', 'Template apply failed', 500);
  }
}
