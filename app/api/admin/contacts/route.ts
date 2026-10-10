import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { contactStatusSchema } from '@/lib/admin/admin.schema';
import { contactsRepository } from '@/lib/db/repositories/contacts.repo';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const status = new URL(request.url).searchParams.get('status') || undefined;
  return ok({ messages: await contactsRepository.list(status) });
}

export async function PATCH(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:contacts`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return fail('ID_REQUIRED', 'Query param id is required', 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = contactStatusSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  await contactsRepository.updateStatus(id, parsed.data.status, payload.sub, parsed.data.reply_text ?? null);
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'CONTACT_HANDLED',
    entityType: 'ContactMessage', entityId: id, req: getRequestMeta(request),
    metadata: { status: parsed.data.status },
  });
  return ok({ id, status: parsed.data.status });
}
