import { NextRequest } from 'next/server';
import { authService } from '@/lib/auth/auth.service';
import { registerSchema } from '@/lib/auth/auth.schema';
import { verifyTurnstile, isTurnstileRequired } from '@/lib/auth/turnstile';
import { ok, fail, failZod } from '@/lib/api/response';
import { getClientIp } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(getClientIp(request), RATE_LIMITS.auth);
  if (!rateLimit.allowed) {
    return fail('RATE_LIMITED', 'Too many registration attempts. Please try again later.', 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  const data = parsed.data;

  if ((await isTurnstileRequired()) && data.turnstile_token) {
    const human = await verifyTurnstile(data.turnstile_token);
    if (!human) {
      return fail('TURNSTILE_FAILED', 'Security check failed', 400);
    }
  }

  try {
    const userId = await authService.register(data);
    return ok({ userId }, { message: 'Registration successful. Please check your email for verification.' }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_EXISTS') {
      return ok({ message: 'If the email is valid, a verification link has been sent.' }, {}, 200);
    }
    if ((error as { code?: string }).code === 'POLICY_VIOLATION') {
      return fail('POLICY_VIOLATION', (error as Error).message, 422);
    }
    console.error('Registration error:', error);
    return fail('INTERNAL_ERROR', 'Registration failed', 500);
  }
}
