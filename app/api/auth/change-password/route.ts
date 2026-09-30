import { NextRequest } from 'next/server';
import { authService } from '@/lib/auth/auth.service';
import { changeSchema } from '@/lib/auth/auth.schema';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }

  const parsed = changeSchema.safeParse(body);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  try {
    await authService.changePassword(payload.sub, parsed.data.currentPassword, parsed.data.newPassword);
    return ok({ message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_CURRENT_PASSWORD') {
      return fail('INVALID_CURRENT_PASSWORD', 'Current password is incorrect', 400);
    }
    if ((error as { code?: string }).code === 'POLICY_VIOLATION') {
      return fail('POLICY_VIOLATION', (error as Error).message, 422);
    }
    console.error('Change password error:', error);
    return fail('INTERNAL_ERROR', 'Password change failed', 500);
  }
}