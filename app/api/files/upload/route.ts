import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { uploadMetaSchema } from '@/lib/files/files.schema';
import { filesService, uploadErrorCode } from '@/lib/files/files.service';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:files:upload`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('INVALID_FORM', 'Expected multipart form-data', 400);
  }
  const file = form.get('file');
  if (!(file instanceof Blob)) return fail('FILE_REQUIRED', 'Field "file" is required', 400);
  const metaParsed = uploadMetaSchema.safeParse({
    patient_id: form.get('patient_id')?.toString() || undefined,
    purpose: form.get('purpose')?.toString() || undefined,
  });
  if (!metaParsed.success) return failZod(metaParsed.error);

  if (metaParsed.data.patient_id) {
    const patient = await patientRepository.findById(metaParsed.data.patient_id);
    if (!patient || patient.doctor_id !== payload.sub) {
      return fail('NOT_FOUND', 'Patient not found', 404);
    }
  }

  const originalName = (file as File).name || 'upload.bin';
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) return fail('EMPTY_FILE', 'File is empty', 400);

  try {
    const result = await filesService.upload(payload.sub, originalName, file.type || 'application/octet-stream', bytes, metaParsed.data);
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'FILE_UPLOADED',
      entityType: 'FileAsset',
      entityId: result.fileId,
      req: getRequestMeta(request),
      metadata: { mime: result.mime, size: result.sizeBytes, purpose: metaParsed.data.purpose },
    });
    return ok(result, { message: 'File uploaded' }, 201);
  } catch (err) {
    const code = uploadErrorCode(err);
    const status = code === 'FILE_TOO_LARGE' ? 413 : 400;
    return fail(code, err instanceof Error ? err.message : 'Upload failed', status);
  }
}
