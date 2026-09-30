import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { threadReplySchema } from '@/lib/messages/messaging.schema';
import { messagingService } from '@/lib/messages/messaging.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:messages:reply`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { patientId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = threadReplySchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await messagingService.reply(payload.sub, patientId, parsed.data);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'MESSAGE_SENT',
      entityType: 'PatientMessage', entityId: result.id, req: getRequestMeta(request),
      metadata: { patient_id: patientId },
    });
    return ok(result, undefined, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'INVALID_ATTACHMENT') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Reply failed', 500);
  }
}
