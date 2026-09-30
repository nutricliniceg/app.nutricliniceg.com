import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { assistantService } from '@/lib/assistant/assistant.service';
import { generationErrorCode } from '@/lib/plans/generation.service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:assistant:restore`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  try {
    await assistantService.restore(payload.sub, id);
    return ok({ restored: true });
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'TRASH_EXPIRED') return fail(code, (err as Error).message, 410);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
