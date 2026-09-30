import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { manualPaySchema } from '@/lib/billing/billing.schema';
import { billingService } from '@/lib/billing/billing.service';
import { generationErrorCode } from '@/lib/plans/generation.service';

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:billing:manual`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = manualPaySchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await billingService.submitManual(payload.sub, parsed.data.plan_id, parsed.data.method, parsed.data.reference);
    return ok(result, undefined, 201);
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
