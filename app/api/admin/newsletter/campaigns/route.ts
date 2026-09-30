import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { campaignCreateSchema, campaignListQuerySchema } from '@/lib/newsletter/campaign.schema';
import { campaignsService } from '@/lib/newsletter/campaigns.service';
import { campaignsRepository } from '@/lib/db/repositories/campaigns.repo';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

function denied(role: string) {
  return role !== 'admin' && role !== 'super_admin';
}

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const parsed = campaignListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const result = await campaignsRepository.list({
    status: parsed.data.status, page: parsed.data.page ?? 1, limit: parsed.data.limit ?? 20,
  });
  return ok({ campaigns: result.rows, total: result.total });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = campaignCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await campaignsService.create(parsed.data, payload.sub);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'CAMPAIGN_CREATED',
      entityType: 'NewsletterCampaign', entityId: result.id, req: getRequestMeta(request),
    });
    const launch = new URL(request.url).searchParams.get('launch') === 'true';
    if (launch) {
      const queued = await campaignsService.launch(result.id);
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role, action: 'CAMPAIGN_LAUNCHED',
        entityType: 'NewsletterCampaign', entityId: result.id, req: getRequestMeta(request),
        metadata: { queued: queued.queued },
      });
      return ok({ ...result, ...queued }, undefined, 201);
    }
    return ok(result, undefined, 201);
  } catch {
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function DELETE(request: NextRequest) {
  // Cancel a scheduled/draft campaign (NL-31 manual intervention).
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail('ID_REQUIRED', 'Query param id is required', 400);
  try {
    await campaignsService.cancel(id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'CAMPAIGN_CANCELLED',
      entityType: 'NewsletterCampaign', entityId: id, req: getRequestMeta(request),
    });
    return ok({ cancelled: true });
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return fail('NOT_FOUND', 'Not found', 404);
    if (code === 'CAMPAIGN_LOCKED') return fail('CAMPAIGN_LOCKED', (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function PATCH(request: NextRequest) {
  // Fetch a report: ?view=report&id=…  (NL-22 sent/failed/clicks)
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const params = new URL(request.url).searchParams;
  if (params.get('view') !== 'report' || !params.get('id')) {
    return fail('BAD_REQUEST', 'Use ?view=report&id=…', 400);
  }
  try {
    return ok(await campaignsService.report(params.get('id') as string));
  } catch {
    return fail('NOT_FOUND', 'Not found', 404);
  }
}

export function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}
