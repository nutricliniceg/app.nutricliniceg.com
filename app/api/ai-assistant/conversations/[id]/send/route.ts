import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { conversationSendSchema } from '@/lib/assistant/assistant.schema';
import { assistantService } from '@/lib/assistant/assistant.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { chainErrorCode } from '@/lib/ai/chain';
import { auditService } from '@/lib/security/audit';

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:assistant:send`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = conversationSendSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await assistantService.send(payload.sub, isAdminRole(payload.role), id, parsed.data);
    const outbound = result.outbound.find((m) => m.role === 'system');
    const patientLinked = outbound && outbound.content.includes('PATIENT CONTEXT');
    if (patientLinked) {
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role, action: 'AI_CONTEXT_SENT',
        entityType: 'AiConversation', entityId: id, req: getRequestMeta(request),
        metadata: { attachments: parsed.data.file_ids?.length ?? 0 },
      });
    }
    return ok(result, undefined, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'CONSENT_REQUIRED') return fail(code, (err as Error).message, 422);
    if (code === 'QUOTA_EXCEEDED' || chainErrorCode(err) === 'QUOTA_EXCEEDED') return fail('QUOTA_EXCEEDED', (err as Error).message, 429);
    if (code === 'AI_UNAVAILABLE' || chainErrorCode(err) === 'AI_UNAVAILABLE') return fail('AI_UNAVAILABLE', (err as Error).message, 503);
    return fail('INTERNAL_ERROR', 'Send failed', 500);
  }
}
