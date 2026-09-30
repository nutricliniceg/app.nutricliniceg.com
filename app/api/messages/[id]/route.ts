import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { messagingService } from '@/lib/messages/messaging.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

// Sender-only delete within the 5-minute window (MSG-07).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:messages:delete`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  try {
    await messagingService.deleteMessage(payload.sub, id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'MESSAGE_DELETED',
      entityType: 'PatientMessage', entityId: id, req: getRequestMeta(request),
    });
    return ok({ deleted: true });
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'DELETE_WINDOW_EXPIRED') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
