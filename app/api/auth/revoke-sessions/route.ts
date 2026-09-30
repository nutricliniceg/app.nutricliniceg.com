import { NextRequest } from 'next/server';
import { authService } from '@/lib/auth/auth.service';
import { ok, unauthorized } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) {
    return unauthorized();
  }

  await authService.revokeAllSessions(payload.sub);
  return ok({ message: 'All sessions revoked successfully' });
}