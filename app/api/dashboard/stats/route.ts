import { NextRequest } from 'next/server';
import { ok, unauthorized } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { timed } from '@/lib/api/timing';
import { patientsService } from '@/lib/patients/patients.service';
import { isStaffRole } from '@/lib/security/rbac';

export const GET = timed(async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isStaffRole(payload.role)) {
    return unauthorized();
  }
  const stats = await patientsService.dashboardStats(payload.sub);
  return ok(stats);
});
