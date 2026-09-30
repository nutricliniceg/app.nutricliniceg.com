import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { trialGrantSchema } from '@/lib/billing/billing.schema';
import { billingService } from '@/lib/billing/billing.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'admin' && payload.role !== 'super_admin') return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:trial`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = trialGrantSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await billingService.grantTrial(payload.sub, parsed.data.user_id, parsed.data.days ?? 14);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'TRIAL_GRANTED',
      entityType: 'User', entityId: parsed.data.user_id, req: getRequestMeta(request),
      metadata: { days: parsed.data.days ?? 14 },
    });
    return ok(result, undefined, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND' || code === 'NO_PLANS') return fail(code, (err as Error).message, code === 'NOT_FOUND' ? 404 : 422);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
