import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { postUpdateSchema } from '@/lib/blog-admin/post.schema';
import { postsService } from '@/lib/blog-admin/posts.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { id } = await params;
  const post = await postsService.get(id);
  if (!post) return notFound();
  return ok({ post });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:blog`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = postUpdateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    await postsService.update(payload.sub, id, parsed.data);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'BLOG_POST_UPDATED',
      entityType: 'BlogPost', entityId: id, req: getRequestMeta(request),
    });
    return ok({ id });
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'DUPLICATE_SLUG' || code === 'NEWSLETTER_LOCKED') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { id } = await params;
  try {
    await postsService.remove(id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'BLOG_POST_DELETED',
      entityType: 'BlogPost', entityId: id, req: getRequestMeta(request),
    });
    return ok({ deleted: true });
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
