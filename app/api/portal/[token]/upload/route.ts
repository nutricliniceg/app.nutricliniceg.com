import { NextRequest } from 'next/server';
import { ok, fail, notFound } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { portalTokensRepository } from '@/lib/db/repositories/portal-tokens.repo';
import { filesService, uploadErrorCode } from '@/lib/files/files.service';
import { PORTAL_INVALID } from '@/lib/portal';
import { generationErrorCode } from '@/lib/errors/fail';

// Token-authed image upload for message attachments (MSG-06: images only,
// 10MB, magic-byte verified + re-encoded by the P10 pipeline).
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rateLimit = await checkRateLimit(`portal:${token}:upload`, RATE_LIMITS.portalWrite);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const row = await portalTokensRepository.findByToken(token);
  const revoked = row ? row.revoked === true || row.revoked === 1 : false;
  if (!row || revoked || new Date(row.expires_at).getTime() <= Date.now()) {
    return notFound('This link is invalid or has expired');
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('INVALID_FORM', 'Expected multipart form-data', 400);
  }
  const file = form.get('file');
  if (!(file instanceof Blob)) return fail('FILE_REQUIRED', 'Field "file" is required', 400);
  try {
    const result = await filesService.upload(
      row.doctor_id, (file as File).name || 'portal-image',
      file.type || 'application/octet-stream', new Uint8Array(await file.arrayBuffer()),
      { patient_id: row.patient_id, purpose: 'portal_message' }
    );
    if (!result.mime.startsWith('image/')) return fail('INVALID_ATTACHMENT', 'Only images can be attached to messages', 422);
    await portalTokensRepository.touchAccess(row.id);
    return ok({ file_id: result.fileId }, undefined, 201);
  } catch (err) {
    if (generationErrorCode(err) === PORTAL_INVALID) return notFound('This link is invalid or has expired');
    const code = uploadErrorCode(err);
    return fail(code, err instanceof Error ? err.message : 'Upload failed', code === 'FILE_TOO_LARGE' ? 413 : 400);
  }
}
