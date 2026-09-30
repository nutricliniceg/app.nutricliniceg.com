import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { bulkEditSchema } from '@/lib/plans/editor.schema';
import { bulkService } from '@/lib/plans/bulk.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

// NP-14/15/16/18: pass {preview: true} for the affected-positions preview,
// otherwise applies with pre/post revisions (undo via restore-revision).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:plans:bulk`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = bulkEditSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await bulkService.bulkEdit(id, payload.sub, parsed.data, isAdminRole(payload.role));
    if (!result) return notFound();
    if (!parsed.data.preview) {
      await auditService.logAction({
        actorId: payload.sub,
        actorRole: payload.role,
        action: 'PLAN_BULK_EDIT',
        entityType: 'NutritionPlan',
        entityId: id,
        req: getRequestMeta(request),
        metadata: { scope: parsed.data.scope, op: parsed.data.op.type },
      });
    }
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'ARCHIVED' || code === 'NO_POSITIONS' || code === 'INVALID_FOOD') {
      return fail(code, (err as Error).message, 422);
    }
    return fail('INTERNAL_ERROR', 'Bulk edit failed', 500);
  }
}
