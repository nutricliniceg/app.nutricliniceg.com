import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { foodListUpdateSchema } from '@/lib/foods/foods.schema';
import { foodListsService } from '@/lib/foods/food-lists.service';
import { auditService } from '@/lib/security/audit';

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const list = await foodListsService.get(id, payload.sub, isAdminRole(payload.role));
  if (!list) return notFound();
  return ok(list);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = foodListUpdateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const updated = await foodListsService.update(id, payload.sub, parsed.data, isAdminRole(payload.role));
  if (!updated) return notFound();
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'FOOD_LIST_UPDATED',
    entityType: 'FoodList',
    entityId: id,
    req: getRequestMeta(request),
    metadata: {},
  });
  return ok({ updated: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const removed = await foodListsService.remove(id, payload.sub, isAdminRole(payload.role));
  if (!removed) return notFound();
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'FOOD_LIST_DELETED',
    entityType: 'FoodList',
    entityId: id,
    req: getRequestMeta(request),
    metadata: {},
  });
  return ok({ deleted: true });
}
