import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { settingSetSchema, testEmailSchema } from '@/lib/admin/admin.schema';
import { settingsAdminService } from '@/lib/admin/settings-admin.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { sendEmail } from '@/lib/email/mailer';
import { auditService } from '@/lib/security/audit';

function isSuper(role: string) {
  return role === 'super_admin';
}

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'admin' && !isSuper(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  try {
    if (key) return ok({ key, value: await settingsAdminService.get(isSuper(payload.role), key) });
    const aliases = settingsAdminService.senderAliases();
    return ok({ settings: await settingsAdminService.list(isSuper(payload.role)), sender_aliases: aliases });
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return fail('NOT_FOUND', 'Setting not found', 404);
    if (code === 'FORBIDDEN') return fail('FORBIDDEN', 'Sensitive settings are managed by super admins', 403);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function PUT(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'admin' && !isSuper(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:settings`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (!key) return fail('KEY_REQUIRED', 'Query param key is required', 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = settingSetSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await settingsAdminService.set(isSuper(payload.role), key, parsed.data.value, payload.sub);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'SETTING_UPDATED',
      entityType: 'SystemSettings', entityId: key, req: getRequestMeta(request),
    });
    return ok(result);
  } catch (err) {
    if (generationErrorCode(err) === 'FORBIDDEN') return fail('FORBIDDEN', 'Sensitive settings are managed by super admins', 403);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'admin' && !isSuper(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:test-email`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = testEmailSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    await sendEmail({
      to: parsed.data.to, subject: 'NutriClinicEG test email',
      text: 'Test email from NutriClinicEG admin settings.',
      html: '<p>Test email from NutriClinicEG admin settings.</p>',
    });
    return ok({ sent: true });
  } catch (err) {
    return fail('EMAIL_FAILED', err instanceof Error ? err.message : 'Test email failed', 502);
  }
}
