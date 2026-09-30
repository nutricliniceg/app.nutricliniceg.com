import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { labAnalyzeRequestSchema } from '@/lib/assistant/assistant.schema';
import { assistantService } from '@/lib/assistant/assistant.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { chainErrorCode } from '@/lib/ai/chain';
import { auditService } from '@/lib/security/audit';

// D-18 lab analyzer via chat: structured extraction → DRAFT values for
// explicit doctor approval (P10 logic reused, approvals audited there).
export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:assistant:labs`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = labAnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await assistantService.analyzeLab(payload.sub, parsed.data.patient_id, parsed.data.text ?? null, parsed.data.file_id ?? null);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'LAB_ANALYZED',
      entityType: 'LabDraft', entityId: result.draftId, req: getRequestMeta(request),
      metadata: { patient_id: parsed.data.patient_id, source: result.source },
    });
    return ok(result, undefined, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'QUOTA_EXCEEDED' || chainErrorCode(err) === 'QUOTA_EXCEEDED') return fail('QUOTA_EXCEEDED', (err as Error).message, 429);
    if (code === 'AI_UNAVAILABLE' || chainErrorCode(err) === 'AI_UNAVAILABLE') return fail('AI_UNAVAILABLE', (err as Error).message, 503);
    return fail('INTERNAL_ERROR', 'Lab analysis failed', 500);
  }
}
