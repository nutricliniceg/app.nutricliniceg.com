import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { visitCreateSchema, visitListQuerySchema } from '@/lib/visits/visits.schema';
import { visitsService } from '@/lib/visits/visits.service';
import { auditService } from '@/lib/security/audit';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const parsed = visitListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const visits = await visitsService.list(parsed.data.patient_id, payload.sub);
  if (!visits) {
    return fail('NOT_FOUND', 'Patient not found', 404);
  }
  return ok({ visits });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:visits:create`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = visitCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const created = await visitsService.create(payload.sub, parsed.data);
  if (!created) {
    return fail('NOT_FOUND', 'Patient not found', 404);
  }
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'VISIT_CREATED',
    entityType: 'Visit',
    entityId: created.id,
    req: getRequestMeta(request),
    metadata: { patient_id: parsed.data.patient_id, visit_date: parsed.data.visit_date },
  });
  return ok(created, { message: 'Visit recorded' }, 201);
}
