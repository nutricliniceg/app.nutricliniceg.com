import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { cloneWeekSchema } from '@/lib/plans/editor.schema';
import { planWeeksService } from '@/lib/plans/plan-weeks.service';
import { auditService } from '@/lib/security/audit';

// NP-08: clone a week into a fresh draft.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:plans:clone`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = cloneWeekSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const result = await planWeeksService.cloneWeek(id, payload.sub, parsed.data.week_number ?? null);
  if (!result) return notFound();
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'PLAN_WEEK_CLONED',
    entityType: 'NutritionPlan',
    entityId: result.planId,
    req: getRequestMeta(request),
    metadata: { source_plan_id: id, week_number: result.weekNumber },
  });
  return ok(result, { message: 'Week cloned as a new draft' }, 201);
}
