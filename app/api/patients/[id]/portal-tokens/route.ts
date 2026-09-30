import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { portalTokenCreateSchema } from '@/lib/portal/portal.schema';
import { portalService } from '@/lib/portal/portal.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const result = await portalService.listTokens(payload.sub, id);
  if (!result) return notFound();
  return ok({ tokens: result });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:portal-tokens`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = portalTokenCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await portalService.createToken(payload.sub, id, parsed.data);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'PORTAL_TOKEN_CREATED',
      entityType: 'Patient', entityId: id, req: getRequestMeta(request),
      metadata: { token_id: result.id, validity_days: parsed.data.validity_days },
    });
    return ok(result, undefined, 201);
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Token creation failed', 500);
  }
}
