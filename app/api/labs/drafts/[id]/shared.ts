import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { labService } from '@/lib/labs/lab.service';
import { auditService } from '@/lib/security/audit';

export async function reviewDraft(request: NextRequest, id: string, decision: 'approved' | 'discarded') {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const done = await labService.review(id, payload.sub, decision);
  if (!done) return notFound('Draft not found or already reviewed');
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: decision === 'approved' ? 'LAB_DRAFT_APPROVED' : 'LAB_DRAFT_DISCARDED',
    entityType: 'LabDraft',
    entityId: id,
    req: getRequestMeta(request),
  });
  return ok({ message: decision === 'approved' ? 'Values approved into the official record' : 'Draft discarded' });
}

export function invalidAction() {
  return fail('INVALID_REQUEST', 'Unknown action', 400);
}
