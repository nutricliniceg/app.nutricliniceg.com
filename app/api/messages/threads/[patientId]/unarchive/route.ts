import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { messagingService } from '@/lib/messages/messaging.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:messages:archive`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { patientId } = await params;
  try {
    await messagingService.setArchived(payload.sub, patientId, false);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'THREAD_UNARCHIVED',
      entityType: 'Patient', entityId: patientId, req: getRequestMeta(request),
    });
    return ok({ archived: false });
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
