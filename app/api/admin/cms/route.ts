import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { cmsVisibilitySchema, cmsPageSchema } from '@/lib/admin/admin.schema';
import { cmsRepository } from '@/lib/db/repositories/cms.repo';
import { auditService } from '@/lib/security/audit';

function denied(role: string) {
  return role !== 'admin' && role !== 'super_admin';
}

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') ?? 'landing';
  if (kind === 'page') {
    const slug = searchParams.get('slug') ?? 'about';
    const page = await cmsRepository.getPage(slug);
    if (!page) return notFound();
    return ok({ page });
  }
  const sections = await cmsRepository.listSections();
  const withItems = [];
  for (const s of sections) {
    withItems.push({ ...s, items: await cmsRepository.listItems(s.id) });
  }
  return ok({ sections: withItems });
}

export async function PUT(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:cms`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind') ?? 'page';
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  if (kind === 'page') {
    const slug = searchParams.get('slug') ?? 'about';
    const parsed = cmsPageSchema.safeParse(body);
    if (!parsed.success) return failZod(parsed.error);
    const existing = await cmsRepository.getPage(slug);
    if (!existing) return notFound();
    await cmsRepository.updatePage(slug, {
      titleAr: parsed.data.title_ar, titleEn: parsed.data.title_en,
      contentAr: parsed.data.content_ar, contentEn: parsed.data.content_en,
    });
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'CMS_PAGE_UPDATED',
      entityType: 'CmsContent', entityId: slug, req: getRequestMeta(request),
    });
    return ok({ slug });
  }
  const parsed = cmsVisibilitySchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const id = searchParams.get('id');
  const target = searchParams.get('target') ?? 'section';
  if (!id) return fail('ID_REQUIRED', 'Query param id is required', 400);
  if (target === 'item') await cmsRepository.updateItem(id, { isVisible: parsed.data.is_visible, sortOrder: parsed.data.sort_order });
  else await cmsRepository.updateSection(id, { isVisible: parsed.data.is_visible, sortOrder: parsed.data.sort_order });
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'CMS_UPDATED',
    entityType: target === 'item' ? 'LandingPageItem' : 'LandingPageSection',
    entityId: id, req: getRequestMeta(request),
  });
  return ok({ id });
}
