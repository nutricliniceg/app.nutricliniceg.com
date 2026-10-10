import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { conversationPatchSchema } from '@/lib/assistant/assistant.schema';
import { assistantService } from '@/lib/assistant/assistant.service';
import { generationErrorCode } from '@/lib/errors/fail';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  try {
    return ok(await assistantService.get(payload.sub, id));
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:assistant:patch`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = conversationPatchSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    return ok(await assistantService.patch(payload.sub, id, {
      title: parsed.data.title, isPinned: parsed.data.is_pinned, isArchived: parsed.data.is_archived,
    }));
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:assistant:delete`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  try {
    await assistantService.remove(payload.sub, id);
    return ok({ deleted: true });
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
