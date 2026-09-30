import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { activationBulkSchema } from '@/lib/admin/admin.schema';
import { adminUsersService } from '@/lib/admin/users.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'admin' && payload.role !== 'super_admin') return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:activations`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const result = await adminUsersService.pending(
    Number(searchParams.get('page') ?? 1) || 1,
    Math.min(Number(searchParams.get('limit') ?? 20) || 20, 100)
  );
  return ok(result);
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'admin' && payload.role !== 'super_admin') return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:bulk-activate`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = activationBulkSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const activated: string[] = [];
  for (const id of parsed.data.ids) {
    try {
      await adminUsersService.setActive(payload.sub, id, true);
      activated.push(id);
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role, action: 'USER_ACTIVATED',
        entityType: 'User', entityId: id, req: getRequestMeta(request),
        metadata: { bulk: true },
      });
    } catch (err) {
      if (generationErrorCode(err) === 'NOT_FOUND') continue;
      throw err;
    }
  }
  return ok({ activated });
}
