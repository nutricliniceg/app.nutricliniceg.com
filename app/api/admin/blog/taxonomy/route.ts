import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { categorySchema, tagSchema } from '@/lib/blog-admin/post.schema';
import { taxonomyRepository } from '@/lib/db/repositories/taxonomy.repo';
import { auditService } from '@/lib/security/audit';

function denied(role: string) {
  return role !== 'admin' && role !== 'super_admin';
}

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const kind = new URL(request.url).searchParams.get('kind') ?? 'categories';
  if (kind === 'tags') return ok({ tags: await taxonomyRepository.listTags() });
  return ok({ categories: await taxonomyRepository.listCategories() });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:taxonomy`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const kind = new URL(request.url).searchParams.get('kind') ?? 'categories';
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  if (kind === 'tags') {
    const parsed = tagSchema.safeParse(body);
    if (!parsed.success) return failZod(parsed.error);
    const id = await taxonomyRepository.insertTag({ slug: parsed.data.slug, nameAr: parsed.data.name_ar, nameEn: parsed.data.name_en });
    return ok({ id }, undefined, 201);
  }
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const id = await taxonomyRepository.insertCategory({
    slug: parsed.data.slug, nameAr: parsed.data.name_ar, nameEn: parsed.data.name_en,
    description: parsed.data.description, sortOrder: parsed.data.sort_order,
  });
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'BLOG_TAXONOMY_CREATED',
    entityType: kind === 'tags' ? 'BlogTag' : 'BlogCategory', entityId: id, req: getRequestMeta(request),
  });
  return ok({ id }, undefined, 201);
}

export async function DELETE(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') ?? 'categories';
  const id = searchParams.get('id');
  if (!id) return fail('ID_REQUIRED', 'Query param id is required', 400);
  if (kind === 'tags') await taxonomyRepository.deleteTag(id);
  else await taxonomyRepository.deleteCategory(id);
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'BLOG_TAXONOMY_DELETED',
    entityType: kind === 'tags' ? 'BlogTag' : 'BlogCategory', entityId: id, req: getRequestMeta(request),
  });
  return ok({ deleted: true });
}
