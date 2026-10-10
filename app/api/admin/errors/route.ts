import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { errorListQuerySchema, errorResolveSchema } from '@/lib/admin/admin.schema';
import { errorsRepository } from '@/lib/db/repositories/errors.repo';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { searchParams } = new URL(request.url);
  const parsed = errorListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const result = await errorsRepository.list({
    level: parsed.data.level, source: parsed.data.source, resolved: parsed.data.resolved,
    page: parsed.data.page ?? 1, limit: parsed.data.limit ?? 20,
  });
  return ok(result);
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:errors`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return fail('ID_REQUIRED', 'Query param id is required', 400);
  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = errorResolveSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  await errorsRepository.resolve(id, parsed.data.note ?? null);
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'ERROR_RESOLVED',
    entityType: 'SystemErrorLog', entityId: id, req: getRequestMeta(request),
  });
  return ok({ resolved: true });
}
