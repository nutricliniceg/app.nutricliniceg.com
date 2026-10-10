import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { postBulkSchema } from '@/lib/blog-admin/post.schema';
import { postsService } from '@/lib/blog-admin/posts.service';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:blog-bulk`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = postBulkSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const result = await postsService.bulk(parsed.data.ids, parsed.data.op, parsed.data.category_id ?? null);
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'BLOG_BULK',
    entityType: 'BlogPost', req: getRequestMeta(request),
    metadata: { op: parsed.data.op, count: result.affected },
  });
  return ok(result);
}
