import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api/response';
import { paymobWebhookSchema } from '@/lib/billing/billing.schema';
import { billingService } from '@/lib/billing/billing.service';
import { generationErrorCode } from '@/lib/errors/fail';

// Paymob posts here without a session (R13): authenticity comes from the
// HMAC alone. Tampered payloads → 403; replays return the stored result.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = paymobWebhookSchema.safeParse(body);
  if (!parsed.success) return fail('BAD_WEBHOOK', 'Unrecognized webhook payload', 400);
  try {
    // The schema is `.passthrough()` at every level, so the validated value is
    // already a plain string-keyed object the service narrows field by field.
    const result = await billingService.handlePaymobWebhook({ ...parsed.data });
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'BAD_SIGNATURE') return fail(code, 'Webhook signature mismatch', 403);
    if (code === 'BAD_WEBHOOK') return fail(code, (err as Error).message, 400);
    if (code === 'BILLING_NOT_CONFIGURED') return fail(code, (err as Error).message, 503);
    return fail('INTERNAL_ERROR', 'Webhook processing failed', 500);
  }
}
