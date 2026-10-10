import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { settingsRepository } from '@/lib/db/repositories/settings.repo';
import { fail } from '@/lib/plans';

// Paymob Accept integration (D-05). Shapes follow the documented Intention
// API + transaction-notification HMAC contract; base URL and key names are
// settings-driven (`billing.paymob.*`) so drift/rotation needs no deploy.
// Money-creation calls use an explicit timeout and NO automatic retry
// (replays must be doctor-initiated). Webhook authenticity is HMAC-SHA512
// over the documented concatenated field order (R13).

export interface PaymobConfig {
  baseUrl: string;
  secretKey: string | null;
  publicKey: string | null;
  hmacSecret: string | null;
}

export async function getPaymobConfig(): Promise<PaymobConfig> {
  const [baseUrl, secretKey, publicKey, hmacSecret] = await Promise.all([
    settingsRepository.get<string>('billing.paymob.base_url'),
    settingsRepository.get<string>('billing.paymob.secret_key'),
    settingsRepository.get<string>('billing.paymob.public_key'),
    settingsRepository.get<string>('billing.paymob.hmac_secret'),
  ]);
  return {
    baseUrl: baseUrl || 'https://accept.paymob.com',
    secretKey: secretKey || null,
    publicKey: publicKey || null,
    hmacSecret: hmacSecret || null,
  };
}

// Documented HMAC field order for transaction notifications.
const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
  'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
  'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
] as const;

function deepGet(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[part];
  }
  if (cur === true) return 'true';
  if (cur === false) return 'false';
  if (cur === null || cur === undefined) return '';
  return String(cur);
}

export function paymobConcatenated(obj: Record<string, unknown>): string {
  return HMAC_FIELDS.map((f) => deepGet(obj, f)).join('');
}

export function verifyPaymobHmac(obj: Record<string, unknown>, hmac: string, secret: string): boolean {
  const expected = createHmac('sha512', secret).update(paymobConcatenated(obj)).digest('hex');
  const a = Buffer.from(hmac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface IntentionResult {
  clientSecret: string;
  paymentUrl: string;
}

// The intention response is third-party data crossing a trust boundary, so it
// is parsed with Zod rather than cast (SEC: validate, never cast at the
// AI/DB/HTTP boundaries). `payment_keys[].key` is Paymob's legacy alias for
// `client_secret`; both are optional in the schema and reconciled below.
const intentionResponseSchema = z.object({
  client_secret: z.string().min(1).optional(),
  payment_keys: z.array(z.object({ key: z.string().min(1).optional() }).passthrough()).optional(),
});

export async function createIntention(input: {
  planId: string; userId: string; userEmail: string; userName: string;
  amountCents: number; currency: string;
}): Promise<IntentionResult> {
  const config = await getPaymobConfig();
  if (!config.secretKey) throw fail('BILLING_NOT_CONFIGURED', 'Online payment is not configured yet — use the manual path');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${config.baseUrl}/v1/intention/`, {
      method: 'POST',
      headers: { Authorization: `Token ${config.secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amountCents,
        currency: input.currency,
        payment_methods: ['card'],
        billing_data: { email: input.userEmail, first_name: input.userName.slice(0, 50) },
        customer: { extras: { user_id: input.userId, plan_id: input.planId } },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw fail('PAYMOB_ERROR', `Paymob intention failed (${res.status})`);
    const parsed = intentionResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw fail('PAYMOB_ERROR', 'Paymob returned an unexpected response shape');
    const clientSecret = parsed.data.client_secret ?? parsed.data.payment_keys?.[0]?.key;
    if (!clientSecret) throw fail('PAYMOB_ERROR', 'Paymob returned no payment key');
    return { clientSecret, paymentUrl: `${config.baseUrl}/v1/intention/${clientSecret}` };
  } catch (err) {
    if ((err as { code?: string }).code) throw err;
    throw fail('PAYMOB_ERROR', err instanceof Error ? err.message : 'Paymob request failed');
  } finally {
    clearTimeout(timer);
  }
}
