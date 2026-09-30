import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { adminUserPatchSchema } from '@/lib/admin/admin.schema';
import { adminUsersService } from '@/lib/admin/users.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'admin' && payload.role !== 'super_admin') return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:user-edit`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = adminUserPatchSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    if (parsed.data.is_active !== undefined) {
      const result = await adminUsersService.setActive(payload.sub, id, parsed.data.is_active);
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role,
        action: parsed.data.is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entityType: 'User', entityId: id, req: getRequestMeta(request),
      });
      return ok(result);
    }
    const result = await adminUsersService.updateUser(payload.sub, id, {
      name: parsed.data.name, phone: parsed.data.phone,
      clinic_name: parsed.data.clinic_name, specialization: parsed.data.specialization,
    });
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'USER_UPDATED',
      entityType: 'User', entityId: id, req: getRequestMeta(request),
    });
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'FORBIDDEN') return fail(code, (err as Error).message, 403);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
