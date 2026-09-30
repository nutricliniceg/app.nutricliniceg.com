import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { patientUpdateSchema, recalculateSchema } from '@/lib/patients/patients.schema';
import { patientsService } from '@/lib/patients/patients.service';
import { auditService } from '@/lib/security/audit';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const result = await patientsService.getWithNutrition(id, payload.sub);
  if (!result) return notFound('Patient not found');
  return ok(result);
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = patientUpdateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const updated = await patientsService.update(id, payload.sub, parsed.data);
  if (!updated) return notFound('Patient not found');
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'PATIENT_UPDATED',
    entityType: 'Patient',
    entityId: id,
    req: getRequestMeta(request),
    metadata: parsed.data,
  });
  return ok({ message: 'Patient updated successfully' });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const patient = await patientsService.remove(id, payload.sub);
  if (!patient) return notFound('Patient not found');
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'PATIENT_DELETED',
    entityType: 'Patient',
    entityId: id,
    req: getRequestMeta(request),
    metadata: { name_ar: patient.name_ar },
  });
  return ok({ message: 'Patient deleted successfully' });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const url = new URL(request.url);
  if (url.searchParams.get('recalculate') !== 'true') {
    return fail('INVALID_REQUEST', 'Invalid request', 400);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = recalculateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const nutrition = await patientsService.recalculate(id, payload.sub, parsed.data);
  if (!nutrition) return notFound('Patient not found');
  return ok({ nutrition });
}
