import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { visitUpdateSchema } from '@/lib/visits/visits.schema';
import { visitsService } from '@/lib/visits/visits.service';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';
import { auditService } from '@/lib/security/audit';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const visit = await visitsRepository.findById(id, payload.sub);
  if (!visit) return notFound('Visit not found');
  return ok({ visit });
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
  const parsed = visitUpdateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const updated = await visitsService.update(id, payload.sub, parsed.data);
  if (!updated) return notFound('Visit not found');
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'VISIT_UPDATED',
    entityType: 'Visit',
    entityId: id,
    req: getRequestMeta(request),
    metadata: parsed.data,
  });
  return ok(updated);
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const removed = await visitsService.remove(id, payload.sub);
  if (!removed) return notFound('Visit not found');
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'VISIT_DELETED',
    entityType: 'Visit',
    entityId: id,
    req: getRequestMeta(request),
  });
  return ok({ message: 'Visit deleted' });
}
