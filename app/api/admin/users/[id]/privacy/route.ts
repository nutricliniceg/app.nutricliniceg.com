import { NextRequest, NextResponse } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { privacyService } from '@/lib/admin/privacy.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';
// CMP-04: admin export (GET → JSON download, audited) + erasure
// (DELETE → cascade hard-delete, audited). Super-admin and admin allowed;
// self-erasure is blocked in the service.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { id } = await params;
  try {
    const data = await privacyService.exportDoctorData(id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'DOCTOR_DATA_EXPORTED',
      entityType: 'User', entityId: id, req: getRequestMeta(request),
    });
    return new NextResponse(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="doctor-${id}-export.json"`,
      },
    });
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { id } = await params;
  const confirm = new URL(request.url).searchParams.get('confirm');
  if (confirm !== 'erase') return fail('CONFIRM_REQUIRED', 'Add ?confirm=erase to confirm erasure', 400);
  try {
    const result = await privacyService.eraseDoctorData(payload.sub, id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'DOCTOR_DATA_ERASED',
      entityType: 'User', entityId: id, req: getRequestMeta(request),
    });
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'FORBIDDEN') return fail(code, (err as Error).message, 403);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
