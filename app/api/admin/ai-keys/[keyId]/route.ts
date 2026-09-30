import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { aiKeyMetaSchema, aiKeyRotateSchema } from '@/lib/admin/admin.schema';
import { aiGatewayService } from '@/lib/admin/ai-gateway.service';
import { auditService } from '@/lib/security/audit';

function denied(role: string) {
  return role !== 'admin' && role !== 'super_admin';
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ keyId: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:ai-keys`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { keyId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = aiKeyMetaSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const result = await aiGatewayService.updateKeyMeta(keyId, { name: parsed.data.name, isActive: parsed.data.is_active });
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'AI_KEY_UPDATED',
    entityType: 'AiApiKey', entityId: keyId, req: getRequestMeta(request),
  });
  return ok(result);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ keyId: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { keyId } = await params;
  await aiGatewayService.removeKey(keyId);
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'AI_KEY_DELETED',
    entityType: 'AiApiKey', entityId: keyId, req: getRequestMeta(request),
  });
  return ok({ deleted: true });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ keyId: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:ai-rotate`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { keyId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = aiKeyRotateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const result = await aiGatewayService.rotateKey(keyId, parsed.data.key);
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'AI_KEY_ROTATED',
    entityType: 'AiApiKey', entityId: keyId, req: getRequestMeta(request),
  });
  return ok(result);
}
