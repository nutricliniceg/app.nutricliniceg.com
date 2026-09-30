import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { labService } from '@/lib/labs/lab.service';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const [drafts, approved] = await Promise.all([
    labService.listDrafts(id, payload.sub),
    labService.listApproved(id, payload.sub),
  ]);
  if (!drafts || !approved) return notFound('Patient not found');
  return ok({ drafts, approved });
}
