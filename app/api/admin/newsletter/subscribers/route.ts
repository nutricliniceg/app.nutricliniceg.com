import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { subscriberAddSchema, subscriberListQuerySchema } from '@/lib/newsletter/newsletter.schema';
import { newsletterService } from '@/lib/newsletter/newsletter.service';
import { subscribersToCsv } from '@/lib/newsletter/tokens-csv';
import { subscribersRepository } from '@/lib/db/repositories/subscribers.repo';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { searchParams } = new URL(request.url);
  if (searchParams.get('view') === 'stats') {
    return ok(await subscribersRepository.stats());
  }
  const parsed = subscriberListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const result = await subscribersRepository.list({
    status: parsed.data.status, locale: parsed.data.locale, q: parsed.data.q,
    page: parsed.data.page ?? 1, limit: parsed.data.limit ?? 20,
  });
  return ok({ subscribers: result.rows, total: result.total });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:sub-add`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = subscriberAddSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await newsletterService.adminAdd(parsed.data.email, parsed.data.name ?? null, parsed.data.locale ?? 'ar');
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'SUBSCRIBER_ADDED',
      entityType: 'NewsletterSubscriber', entityId: result.id, req: getRequestMeta(request),
    });
    return ok(result, undefined, 201);
  } catch (err) {
    if (generationErrorCode(err) === 'DUPLICATE_SUBSCRIBER') return fail('DUPLICATE_SUBSCRIBER', (err as Error).message, 409);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function DELETE(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail('ID_REQUIRED', 'Query param id is required', 400);
  try {
    await newsletterService.hardDelete(id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'SUBSCRIBER_DELETED',
      entityType: 'NewsletterSubscriber', entityId: id, req: getRequestMeta(request),
    });
    return ok({ deleted: true });
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function PUT(request: NextRequest) {
  // CSV import (source=import, pending until each confirms).
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:sub-import`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let text: string;
  try {
    text = await request.text();
  } catch {
    return fail('INVALID_CSV', 'Expected CSV text', 400);
  }
  if (!text || text.length > 2_000_000) return fail('INVALID_CSV', 'CSV missing or too large (2MB)', 400);
  const result = await newsletterService.importCsv(text);
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'SUBSCRIBER_IMPORTED',
    entityType: 'NewsletterSubscriber', req: getRequestMeta(request),
    metadata: { imported: result.imported, skipped: result.skipped },
  });
  return ok(result);
}

export async function PATCH(request: NextRequest) {
  // CSV export (audited). Toggle via ?format=csv on this route.
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const parsed = subscriberListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const result = await subscribersRepository.list({
    status: parsed.data.status, locale: parsed.data.locale, q: parsed.data.q, page: 1, limit: 500,
  });
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'SUBSCRIBER_EXPORTED',
    entityType: 'NewsletterSubscriber', req: getRequestMeta(request),
    metadata: { count: result.rows.length },
  });
  return new NextResponse(subscribersToCsv(result.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="subscribers.csv"',
    },
  });
}
