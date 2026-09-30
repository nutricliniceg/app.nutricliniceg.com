import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { planListQuerySchema } from '@/lib/plans/plans.schema';
import { generationService } from '@/lib/plans/generation.service';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:plans:list`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const parsed = planListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const result = await generationService.list(
    payload.sub,
    parsed.data.patient_id ?? null,
    parsed.data.page ?? 1,
    parsed.data.limit ?? 20
  );
  if (!result) return fail('NOT_FOUND', 'Patient not found', 404);
  return ok(result);
}
