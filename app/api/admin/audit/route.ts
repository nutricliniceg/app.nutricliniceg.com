import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { auditListQuerySchema } from '@/lib/admin/admin.schema';
import { auditRepository } from '@/lib/db/repositories/audit.repo';
import { isSuperRole } from '@/lib/security/rbac';

// ADM-22: super_admin-only, read-only. No write endpoints exist for the
// audit log anywhere in the codebase (§6.7 append-only).
export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isSuperRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:audit`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const parsed = auditListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const result = await auditRepository.list({
    actor: parsed.data.actor, action: parsed.data.action, entity: parsed.data.entity,
    from: parsed.data.from, to: parsed.data.to,
    page: parsed.data.page ?? 1, limit: parsed.data.limit ?? 20,
  });
  return ok(result);
}
