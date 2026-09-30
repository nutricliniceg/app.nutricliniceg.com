import { NextRequest } from 'next/server';
import { authService } from '@/lib/auth/auth.service';
import { ok, unauthorized } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) {
    return unauthorized();
  }

  const user = await authService.getProfile(payload.sub);
  if (!user) {
    return unauthorized('User not found');
  }

  return ok(user);
}
