import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { labAnalyzeSchema } from '@/lib/labs/lab.schema';
import { labService } from '@/lib/labs/lab.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = labAnalyzeSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await labService.analyze(payload.sub, parsed.data);
    if (!result) {
      return fail('NOT_FOUND', 'Patient or file not found', 404);
    }
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'LAB_DRAFT_CREATED',
      entityType: 'LabDraft',
      entityId: result.draftId,
      req: getRequestMeta(request),
      metadata: { patient_id: parsed.data.patient_id, source: result.source, items: result.items.length },
    });
    return ok(result, { message: 'Draft created — doctor approval required before values become official' }, 201);
  } catch {
    return fail('INTERNAL_ERROR', 'Analysis failed', 500);
  }
}
