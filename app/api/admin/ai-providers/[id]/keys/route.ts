import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { aiKeyCreateSchema } from '@/lib/admin/admin.schema';
import { aiGatewayService } from '@/lib/admin/ai-gateway.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:ai-keys`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = aiKeyCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await aiGatewayService.addKey(id, parsed.data.key, parsed.data.name ?? null);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'AI_KEY_CREATED',
      entityType: 'AiApiKey', entityId: result.id, req: getRequestMeta(request),
      metadata: { provider_id: id },
    });
    return ok(result, undefined, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'INVALID_KEY') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
