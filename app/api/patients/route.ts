import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { patientCreateSchema, patientListQuerySchema } from '@/lib/patients/patients.schema';
import { timed } from '@/lib/api/timing';
import { patientsService } from '@/lib/patients/patients.service';
import { auditService } from '@/lib/security/audit';

export const GET = timed(async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:patients:list`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const parsed = patientListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const result = await patientsService.list(payload.sub, parsed.data);
  return ok(result);
});

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:patients:create`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = patientCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const patientId = await patientsService.create(payload.sub, parsed.data);
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'PATIENT_CREATED',
      entityType: 'Patient',
      entityId: patientId,
      req: getRequestMeta(request),
      metadata: { name_ar: parsed.data.name_ar, gender: parsed.data.gender },
    });
    return ok({ patientId }, { message: 'Patient created successfully' }, 201);
  } catch {
    return fail('INTERNAL_ERROR', 'Failed to create patient', 500);
  }
}
