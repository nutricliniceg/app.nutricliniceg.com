import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { postPublishSchema, revisionRestoreSchema } from '@/lib/blog-admin/post.schema';
import { postsService } from '@/lib/blog-admin/posts.service';
import { mintPreviewToken } from '@/lib/blog-admin/preview';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

function denied(role: string) {
  return role !== 'admin' && role !== 'super_admin';
}

async function readJson(request: NextRequest): Promise<unknown | null> {
  try {
    const text = await request.text();
    return text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return null;
  }
}

// POST /publish {published_at?} | /unpublish | /archive | /preview | /translate | /restore
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; op: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:blog-op`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id, op } = await params;
  try {
    if (op === 'preview') {
      return ok({ token: mintPreviewToken(id) });
    }
    if (op === 'translate') {
      const result = await postsService.translate(payload.sub, id);
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role, action: 'BLOG_POST_TRANSLATED',
        entityType: 'BlogPost', entityId: result.id, req: getRequestMeta(request),
        metadata: { source_id: id },
      });
      return ok(result, undefined, 201);
    }
    if (op === 'restore') {
      const body = await readJson(request);
      if (body === null) return fail('INVALID_JSON', 'Invalid JSON body', 400);
      const parsed = revisionRestoreSchema.safeParse(body);
      if (!parsed.success) return failZod(parsed.error);
      await postsService.restore(payload.sub, id, parsed.data.revision_no);
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role, action: 'BLOG_POST_RESTORED',
        entityType: 'BlogPost', entityId: id, req: getRequestMeta(request),
        metadata: { revision_no: parsed.data.revision_no },
      });
      return ok({ restored: true });
    }
    if (op === 'publish' || op === 'schedule') {
      const body = await readJson(request);
      if (body === null) return fail('INVALID_JSON', 'Invalid JSON body', 400);
      const parsed = postPublishSchema.safeParse(body);
      if (!parsed.success) return failZod(parsed.error);
      const result = await postsService.publish(payload.sub, id, parsed.data.published_at ?? null);
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role, action: 'BLOG_POST_PUBLISHED',
        entityType: 'BlogPost', entityId: id, req: getRequestMeta(request),
        metadata: { status: result.status },
      });
      return ok(result);
    }
    if (op === 'unpublish' || op === 'archive') {
      await postsService.setStatus(id, op === 'archive' ? 'archived' : 'draft');
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role, action: op === 'archive' ? 'BLOG_POST_ARCHIVED' : 'BLOG_POST_UNPUBLISHED',
        entityType: 'BlogPost', entityId: id, req: getRequestMeta(request),
      });
      return ok({ status: op === 'archive' ? 'archived' : 'draft' });
    }
    return notFound();
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
