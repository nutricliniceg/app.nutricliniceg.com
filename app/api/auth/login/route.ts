import { NextRequest } from 'next/server';
import { authService } from '@/lib/auth/auth.service';
import { loginSchema } from '@/lib/auth/auth.schema';
import { verifyTurnstile, isTurnstileRequired } from '@/lib/auth/turnstile';
import { ok, fail, failZod } from '@/lib/api/response';
import { getClientIp } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(getClientIp(request), RATE_LIMITS.auth);
  if (!rateLimit.allowed) {
    return fail('RATE_LIMITED', 'Too many login attempts. Please try again later.', 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  const { email, password, turnstile_token } = parsed.data;

  if ((await isTurnstileRequired()) && turnstile_token) {
    const human = await verifyTurnstile(turnstile_token);
    if (!human) {
      return fail('TURNSTILE_FAILED', 'Security check failed', 400);
    }
  }

  try {
    const result = await authService.login(email, password);
    return ok(result, { message: 'Login successful' });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'INVALID_CREDENTIALS') {
        return fail('INVALID_CREDENTIALS', 'Invalid email or password', 401);
      }
      if (error.message === 'ACCOUNT_INACTIVE') {
        return fail('ACCOUNT_INACTIVE', 'Account is not activated. Please contact support.', 403);
      }
      if (error.message === 'EMAIL_NOT_VERIFIED') {
        return fail('EMAIL_NOT_VERIFIED', 'Please verify your email first', 403);
      }
      if (error.message === 'PASSWORD_EXPIRED') {
        return fail('PASSWORD_EXPIRED', 'Password expired — please reset your password', 401);
      }
    }
    console.error('Login error:', error);
    return fail('INTERNAL_ERROR', 'Login failed', 500);
  }
}
