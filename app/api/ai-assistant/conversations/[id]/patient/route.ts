import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { conversationLinkSchema } from '@/lib/assistant/assistant.schema';
import { assistantService } from '@/lib/assistant/assistant.service';
import { generationErrorCode, generationErrorExtra } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:assistant:link`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = conversationLinkSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await assistantService.linkPatient(payload.sub, id, parsed.data.patient_id, parsed.data.confirmed ?? false);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'AI_CONTEXT_LINKED',
      entityType: 'AiConversation', entityId: id, req: getRequestMeta(request),
      metadata: { patient_id: parsed.data.patient_id },
    });
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'NEEDS_CONFIRMATION') {
      const extra = generationErrorExtra(err);
      return fail(code, (err as Error).message, 422, { confirm: ['confirmed'], extra: extra ? [JSON.stringify(extra)] : [] });
    }
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:assistant:link`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  try {
    const result = await assistantService.unlinkPatient(payload.sub, id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'AI_CONTEXT_UNLINKED',
      entityType: 'AiConversation', entityId: id, req: getRequestMeta(request),
    });
    return ok(result);
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
