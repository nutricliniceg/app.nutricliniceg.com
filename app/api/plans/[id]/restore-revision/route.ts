import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { restoreRevisionSchema } from '@/lib/plans/editor.schema';
import { editorService } from '@/lib/plans/editor.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const result = await editorService.listRevisions(id, payload.sub);
  if (!result) return notFound();
  return ok(result);
}

// NP-13: restore creates a new revision (pre-restore backup) — never destructive.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:plans:restore`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = restoreRevisionSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await editorService.restoreRevision(id, payload.sub, parsed.data.revision_no);
    if (!result) return notFound();
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'PLAN_REVISION_RESTORED',
      entityType: 'NutritionPlan',
      entityId: id,
      req: getRequestMeta(request),
      metadata: { restored: result.restored, backup_revision: result.backupRevision },
    });
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND' || code === 'CORRUPT_REVISION') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Restore failed', 500);
  }
}
