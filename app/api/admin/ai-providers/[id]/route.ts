import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { aiProviderPatchSchema } from '@/lib/admin/admin.schema';
import { aiGatewayService } from '@/lib/admin/ai-gateway.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

function denied(role: string) {
  return role !== 'admin' && role !== 'super_admin';
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:ai-provider`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = aiProviderPatchSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await aiGatewayService.updateProvider(id, {
      isEnabled: parsed.data.is_enabled, priorityOrder: parsed.data.priority_order,
      baseUrl: parsed.data.base_url, name: parsed.data.name,
      dataRetention: parsed.data.data_retention,
    });
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'AI_PROVIDER_UPDATED',
      entityType: 'AiProvider', entityId: id, req: getRequestMeta(request),
    });
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'INVALID_PROVIDER') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
