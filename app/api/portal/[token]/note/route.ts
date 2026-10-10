import { NextRequest } from 'next/server';
import { ok, fail, failZod, notFound } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { portalNoteSchema } from '@/lib/portal/portal.schema';
import { portalService, PORTAL_INVALID } from '@/lib/portal/portal.service';
import { generationErrorCode } from '@/lib/errors/fail';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rateLimit = await checkRateLimit(`portal:${token}:note`, RATE_LIMITS.portalWrite);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = portalNoteSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    return ok(await portalService.submitNote(token, parsed.data.text), undefined, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === PORTAL_INVALID) return notFound('This link is invalid or has expired');
    if (code === 'PERMISSION_DENIED') return fail(code, (err as Error).message, 403);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
