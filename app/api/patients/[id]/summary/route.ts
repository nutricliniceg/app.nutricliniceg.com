import { NextRequest } from 'next/server';
import { ok, unauthorized, notFound } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { patientsService } from '@/lib/patients/patients.service';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const result = await patientsService.summarize(id, payload.sub);
  if (!result) return notFound('Patient not found');
  return ok(result);
}
