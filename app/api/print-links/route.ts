import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { printLinkCreateSchema } from '@/lib/print/print.schema';
import { printService } from '@/lib/print/print.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

// Doctor-minted short-lived share links for print pages (24h, HMAC).
export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:print-links`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = printLinkCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await printService.mintLink(payload.sub, parsed.data.plan_type, parsed.data.plan_id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'PRINT_LINK_MINTED',
      entityType: parsed.data.plan_type === 'nutrition' ? 'NutritionPlan' : 'ExercisePlan',
      entityId: parsed.data.plan_id, req: getRequestMeta(request),
    });
    return ok(result, undefined, 201);
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Print link failed', 500);
  }
}
