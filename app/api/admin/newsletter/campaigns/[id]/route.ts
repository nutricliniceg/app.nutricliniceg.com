import { NextRequest } from 'next/server';
import { ok, fail, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { campaignUpdateSchema, campaignTestSchema } from '@/lib/newsletter/campaign.schema';
import { campaignsService } from '@/lib/newsletter/campaigns.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

function denied(role: string) {
  return role !== 'admin' && role !== 'super_admin';
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Edit a draft/scheduled campaign (NL-31) or test-send (?op=test).
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const op = new URL(request.url).searchParams.get('op');
  try {
    if (op === 'test') {
      const parsed = campaignTestSchema.safeParse(body);
      if (!parsed.success) return fail('INVALID_EMAIL', 'Valid email required', 400);
      await campaignsService.sendTest(id, parsed.data.email);
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role, action: 'CAMPAIGN_TEST_SENT',
        entityType: 'NewsletterCampaign', entityId: id, req: getRequestMeta(request),
        metadata: { to: parsed.data.email },
      });
      return ok({ testSent: true });
    }
    if (op === 'launch') {
      const queued = await campaignsService.launch(id);
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role, action: 'CAMPAIGN_LAUNCHED',
        entityType: 'NewsletterCampaign', entityId: id, req: getRequestMeta(request),
        metadata: { queued: queued.queued },
      });
      return ok(queued);
    }
    const parsed = campaignUpdateSchema.safeParse(body);
    if (!parsed.success) return fail('INVALID_BODY', 'Invalid campaign patch', 400);
    await campaignsService.update(id, {
      subject: parsed.data.subject,
      bodyHtml: parsed.data.body_html,
      bodyText: parsed.data.body_text,
      scheduledAt: parsed.data.scheduled_at === undefined ? undefined : parsed.data.scheduled_at ? new Date(parsed.data.scheduled_at) : null,
    });
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'CAMPAIGN_UPDATED',
      entityType: 'NewsletterCampaign', entityId: id, req: getRequestMeta(request),
    });
    return ok({ updated: true });
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return fail('NOT_FOUND', 'Not found', 404);
    if (code === 'CAMPAIGN_LOCKED') return fail('CAMPAIGN_LOCKED', (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
