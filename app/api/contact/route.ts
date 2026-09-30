import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { ok, fail, failZod } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { contactIntakeSchema } from '@/lib/admin/admin.schema';
import { contactsRepository } from '@/lib/db/repositories/contacts.repo';

// Public contact intake (fills the P08 gap): rate-limited, IP-hashed.
export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(`contact:${request.headers.get('x-forwarded-for') ?? 'unknown'}`, RATE_LIMITS.contact);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = contactIntakeSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const ipHash = createHash('sha256')
    .update(ip + (process.env.AUDIT_IP_SALT || 'default-salt-change-in-production'))
    .digest('hex');
  const id = await contactsRepository.insert({
    name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone,
    subject: parsed.data.subject, message: parsed.data.message, ipHash,
  });
  return ok({ id }, undefined, 201);
}
