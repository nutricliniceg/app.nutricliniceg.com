import { NextRequest } from 'next/server';
import { authService } from '@/lib/auth/auth.service';
import { forgotSchema } from '@/lib/auth/auth.schema';
import { verifyTurnstile, isTurnstileRequired } from '@/lib/auth/turnstile';
import { ok, fail, failZod } from '@/lib/api/response';
import { getClientIp } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(getClientIp(request), RATE_LIMITS.auth);
  if (!rateLimit.allowed) {
    return fail('RATE_LIMITED', 'Too many requests. Please try again later.', 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }

  const parsed = forgotSchema.safeParse(body);
  if (!parsed.success) {
    return failZod(parsed.error);
  }

  if ((await isTurnstileRequired()) && parsed.data.turnstile_token) {
    const human = await verifyTurnstile(parsed.data.turnstile_token);
    if (!human) {
      return fail('TURNSTILE_FAILED', 'Security check failed', 400);
    }
  }

  await authService.requestPasswordReset(parsed.data.email);
  return ok({ message: 'If the email exists, a reset code has been sent.' });
}
