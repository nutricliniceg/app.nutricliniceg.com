import { NextRequest } from 'next/server';
import { ok, fail, unauthorized } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { billingRepository } from '@/lib/db/repositories/billing.repo';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const status = new URL(request.url).searchParams.get('status') || undefined;
  return ok({ requests: await billingRepository.listManualRequests(status) });
}
