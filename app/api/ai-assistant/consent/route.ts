import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { z } from 'zod';
import { uuidSchema } from '@/lib/api/validation';
import { assistantService } from '@/lib/assistant/assistant.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

// CMP-02 inline consent capture for AI sharing (unblocks AI-25 gate).
export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:assistant:consent`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = z.object({ patient_id: uuidSchema }).safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await assistantService.captureConsent(payload.sub, parsed.data.patient_id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'AI_CONSENT_CAPTURED',
      entityType: 'Patient', entityId: parsed.data.patient_id, req: getRequestMeta(request),
    });
    return ok(result);
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
