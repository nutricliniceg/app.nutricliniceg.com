import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { brandingUpdateSchema } from '@/lib/print/print.schema';
import { brandingService } from '@/lib/print/print.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const result = await brandingService.get(payload.sub);
  if (!result) return fail('NOT_FOUND', 'User not found', 404);
  return ok(result);
}

export async function PUT(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:branding`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = brandingUpdateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await brandingService.update(payload.sub, parsed.data);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'BRANDING_UPDATED',
      entityType: 'User', entityId: payload.sub, req: getRequestMeta(request),
      metadata: { clinic_name: parsed.data.clinic_name ?? undefined },
    });
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return fail('NOT_FOUND', 'Logo file not found', 404);
    if (code === 'INVALID_LOGO') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Branding update failed', 500);
  }
}
