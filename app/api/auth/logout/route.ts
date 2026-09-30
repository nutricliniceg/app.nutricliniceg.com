import { NextRequest } from 'next/server';
import { authService } from '@/lib/auth/auth.service';
import { ok } from '@/lib/api/response';
import { getTokenFromRequest } from '@/lib/security/session';

export async function POST(request: NextRequest) {
  await authService.logout(getTokenFromRequest(request) ?? undefined);
  return ok({ message: 'Logged out successfully' });
}
