import { NextRequest } from 'next/server';
import { authService } from '@/lib/auth/auth.service';
import { resetSchema } from '@/lib/auth/auth.schema';
import { ok, fail, failZod } from '@/lib/api/response';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }

  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  try {
    await authService.resetPassword(parsed.data.email, parsed.data.code, parsed.data.password);
    return ok({ message: 'Password reset successful' });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_CODE') {
      return fail('INVALID_CODE', 'Invalid or expired reset code', 400);
    }
    if ((error as { code?: string }).code === 'POLICY_VIOLATION') {
      return fail('POLICY_VIOLATION', (error as Error).message, 422);
    }
    console.error('Reset password error:', error);
    return fail('INTERNAL_ERROR', 'Password reset failed', 500);
  }
}