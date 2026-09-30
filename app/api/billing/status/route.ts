import { NextRequest } from 'next/server';
import { ok, unauthorized } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { billingService } from '@/lib/billing/billing.service';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  return ok(await billingService.status(payload.sub));
}
