import { ok } from '@/lib/api/response';
import { billingService } from '@/lib/billing/billing.service';

// Public plan catalog for the pricing page (active plans only).
export async function GET() {
  return ok({ plans: await billingService.publicPlans() });
}
