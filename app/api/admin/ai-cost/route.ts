import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { aiCostQuerySchema } from '@/lib/admin/admin.schema';
import { aiGatewayService } from '@/lib/admin/ai-gateway.service';
import { auditService } from '@/lib/security/audit';

function denied(role: string) {
  return role !== 'admin' && role !== 'super_admin';
}

function monthBounds(now = new Date()): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  return { from, to };
}

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:ai-cost`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const parsed = aiCostQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const bounds = monthBounds();
  const dashboard = await aiGatewayService.costDashboard(
    parsed.data.from ?? bounds.from, parsed.data.to ?? bounds.to, parsed.data.top ?? 10
  );
  if (searchParams.get('format') === 'csv') {
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'AI_COST_EXPORTED',
      entityType: 'AiUsageLog', req: getRequestMeta(request),
      metadata: { from: dashboard.from, to: dashboard.to },
    });
    return new NextResponse(aiGatewayService.toCsv(dashboard.trend), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ai-cost.csv"',
      },
    });
  }
  return ok(dashboard);
}
