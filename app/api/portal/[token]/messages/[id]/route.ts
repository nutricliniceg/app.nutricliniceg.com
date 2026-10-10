import { NextRequest } from 'next/server';
import { ok, fail, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { messagingService } from '@/lib/messages/messaging.service';
import { portalTokensRepository } from '@/lib/db/repositories/portal-tokens.repo';
import { PORTAL_INVALID } from '@/lib/portal';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';

// Patient delete of their own message within 5 minutes (MSG-07).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const rateLimit = await checkRateLimit(`portal:${token}:delete`, RATE_LIMITS.portalWrite);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  try {
    await messagingService.portalDelete(token, id);
    const row = await portalTokensRepository.findByToken(token);
    await auditService.logAction({
      actorId: row?.patient_id ?? 'unknown', actorRole: 'patient', action: 'MESSAGE_DELETED',
      entityType: 'PatientMessage', entityId: id, req: getRequestMeta(request),
    });
    return ok({ deleted: true });
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === PORTAL_INVALID || code === 'NOT_FOUND') return notFound('This link is invalid or has expired');
    if (code === 'DELETE_WINDOW_EXPIRED') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
