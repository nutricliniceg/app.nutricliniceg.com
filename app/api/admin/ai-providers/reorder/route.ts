import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { aiReorderSchema } from '@/lib/admin/admin.schema';
import { aiGatewayService } from '@/lib/admin/ai-gateway.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:ai-reorder`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = aiReorderSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await aiGatewayService.reorder(parsed.data.ids);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'AI_PRIORITY_REORDERED',
      entityType: 'AiProvider', entityId: parsed.data.ids.join(','), req: getRequestMeta(request),
    });
    return ok(result);
  } catch (err) {
    if (generationErrorCode(err) === 'INVALID_ORDER') return fail('INVALID_ORDER', (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
