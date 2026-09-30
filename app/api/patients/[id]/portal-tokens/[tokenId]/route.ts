import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { portalService } from '@/lib/portal/portal.service';
import { auditService } from '@/lib/security/audit';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; tokenId: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:portal-tokens`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { tokenId } = await params;
  const revoked = await portalService.revokeToken(payload.sub, tokenId);
  if (!revoked) return notFound();
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'PORTAL_TOKEN_REVOKED',
    entityType: 'PatientPortalToken', entityId: tokenId, req: getRequestMeta(request),
  });
  return ok({ revoked: true });
}
