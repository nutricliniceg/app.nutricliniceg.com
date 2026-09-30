import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { conversationListQuerySchema, conversationCreateSchema } from '@/lib/assistant/assistant.schema';
import { assistantService } from '@/lib/assistant/assistant.service';
import { generationErrorCode } from '@/lib/plans/generation.service';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:assistant:list`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const raw: Record<string, string> = Object.fromEntries(searchParams);
  const parsed = conversationListQuerySchema.safeParse({
    q: raw.q || undefined,
    archived: raw.archived,
    patient_id: raw.patient_id === '' ? null : raw.patient_id || undefined,
    trash: raw.trash,
  });
  if (!parsed.success) return failZod(parsed.error);
  const rows = await assistantService.list(payload.sub, {
    q: parsed.data.q, archived: parsed.data.archived,
    patientId: parsed.data.patient_id, trash: parsed.data.trash,
  });
  return ok({ conversations: rows });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:assistant:create`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = conversationCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await assistantService.create(payload.sub, parsed.data.title ?? null, parsed.data.patient_id ?? null);
    return ok(result, undefined, 201);
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return fail('NOT_FOUND', 'Patient not found', 404);
    return fail('INTERNAL_ERROR', 'Conversation creation failed', 500);
  }
}
