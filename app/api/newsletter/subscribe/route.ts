import { NextRequest } from 'next/server';
import { ok, fail, failZod } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { subscribeSchema } from '@/lib/newsletter/newsletter.schema';
import { newsletterService } from '@/lib/newsletter/newsletter.service';
import { isTurnstileRequired, verifyTurnstile } from '@/lib/auth/turnstile';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = await checkRateLimit(`newsletter:${ip}`, RATE_LIMITS.newsletter);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  if ((await isTurnstileRequired()) && parsed.data.turnstile_token) {
    const human = await verifyTurnstile(parsed.data.turnstile_token);
    if (!human) return fail('TURNSTILE_FAILED', 'Security check failed', 400);
  }
  // The response is ALWAYS neutral (NL-08) — result carries no signal.
  const result = await newsletterService.subscribe(parsed.data, ip);
  return ok(result, undefined, 201);
}
