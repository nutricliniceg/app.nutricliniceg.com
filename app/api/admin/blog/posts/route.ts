import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { postCreateSchema, postListQuerySchema } from '@/lib/blog-admin/post.schema';
import { postsService } from '@/lib/blog-admin/posts.service';
import { auditService } from '@/lib/security/audit';

function denied(role: string) {
  return role !== 'admin' && role !== 'super_admin';
}

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { searchParams } = new URL(request.url);
  const parsed = postListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const result = await postsService.list({
    status: parsed.data.status, untranslated: parsed.data.untranslated,
    q: parsed.data.q, page: parsed.data.page ?? 1, limit: parsed.data.limit ?? 20,
  });
  return ok(result);
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:blog`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = postCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const result = await postsService.create(payload.sub, parsed.data);
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'BLOG_POST_CREATED',
    entityType: 'BlogPost', entityId: result.id, req: getRequestMeta(request),
  });
  return ok(result, undefined, 201);
}
