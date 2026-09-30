import { NextRequest } from 'next/server';
import { ok, fail, unauthorized } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { adminRepository } from '@/lib/db/repositories/admin.repo';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'admin' && payload.role !== 'super_admin') return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:overview`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const stats = await adminRepository.overview();
  const [pending, contacts] = await Promise.all([
    adminRepository.countPending(),
    adminRepository.countNewContacts(),
  ]);
  // AI cost month-to-date is a placeholder until the P23 cost dashboard.
  return ok({ ...stats, pending_activations: pending, new_contacts: contacts, ai_cost_mtd: 0, ai_cost_note: 'P23' });
}
