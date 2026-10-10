import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { turnstileSetSchema, passwordPolicySchema } from '@/lib/admin/admin.schema';
import { aiGatewayService } from '@/lib/admin/ai-gateway.service';
import { auditService } from '@/lib/security/audit';
import { isAdminRole, isSuperRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  return ok(await aiGatewayService.getSecurity(isSuperRole(payload.role)));
}

export async function PUT(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:security`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const section = searchParams.get('section') ?? 'turnstile';
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  if (section === 'password_policy') {
    const parsed = passwordPolicySchema.safeParse(body);
    if (!parsed.success) return failZod(parsed.error);
    const merged = await aiGatewayService.setPasswordPolicy(parsed.data);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'PASSWORD_POLICY_UPDATED',
      entityType: 'SystemSettings', entityId: 'security.password_policy', req: getRequestMeta(request),
    });
    return ok(merged);
  }
  const parsed = turnstileSetSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const result = await aiGatewayService.setTurnstile({
    enabled: parsed.data.enabled, siteKey: parsed.data.site_key, secretKey: parsed.data.secret_key,
  });
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'TURNSTILE_UPDATED',
    entityType: 'SystemSettings', entityId: 'security.turnstile', req: getRequestMeta(request),
  });
  return ok(result);
}
