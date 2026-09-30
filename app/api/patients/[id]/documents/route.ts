import { NextRequest } from 'next/server';
import { ok, unauthorized, notFound } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { filesService } from '@/lib/files/files.service';
import { patientRepository } from '@/lib/db/repositories/patients.repo';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const patient = await patientRepository.findById(id);
  if (!patient || patient.doctor_id !== payload.sub) return notFound('Patient not found');
  const files = await filesService.listPatientFiles(payload.sub, id);
  return ok({ files });
}
