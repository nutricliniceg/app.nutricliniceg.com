import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { bulkEmailSchema } from '@/lib/admin/admin.schema';
import { bulkEmailService } from '@/lib/admin/bulk-email.service';
import { adminMessagesRepository } from '@/lib/db/repositories/admin-messages.repo';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  return ok({ messages: await adminMessagesRepository.list(50) });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:bulk-email`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = bulkEmailSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await bulkEmailService.compose({
      senderId: payload.sub, alias: parsed.data.alias, audience: parsed.data.audience,
      userIds: parsed.data.user_ids, subject: parsed.data.subject, body: parsed.data.body,
      viaEmail: parsed.data.via_email, viaInApp: parsed.data.via_in_app,
    });
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'BULK_EMAIL_SENT',
      entityType: 'AdminMessage', entityId: result.messageId, req: getRequestMeta(request),
      metadata: { audience: parsed.data.audience, recipients: result.recipients, failed: result.failed },
    });
    return ok(result, undefined, 201);
  } catch (err) {
    if (generationErrorCode(err) === 'NO_RECIPIENTS') return fail('NO_RECIPIENTS', (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Bulk email failed', 500);
  }
}
