import { NextRequest } from 'next/server';
import { authService } from '@/lib/auth/auth.service';
import { verifySchema } from '@/lib/auth/auth.schema';
import { ok, fail, failZod } from '@/lib/api/response';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  const success = await authService.verifyEmail(parsed.data.userId, parsed.data.code);
  if (!success) {
    return fail('INVALID_CODE', 'Invalid or expired verification code', 400);
  }

  return ok({ message: 'Email verified successfully' });
}