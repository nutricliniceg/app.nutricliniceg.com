import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { adminUsersQuerySchema } from '@/lib/admin/admin.schema';
import { adminUsersService } from '@/lib/admin/users.service';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:users`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const parsed = adminUsersQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const result = await adminUsersService.list({
    search: parsed.data.search, role: parsed.data.role, status: parsed.data.status,
    planId: parsed.data.plan_id, page: parsed.data.page ?? 1, limit: parsed.data.limit ?? 20,
  });
  return ok(result);
}
