import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { mediaUploadMetaSchema, mediaListQuerySchema, mediaPatchSchema } from '@/lib/blog-admin/post.schema';
import { mediaService } from '@/lib/blog-admin/media.service';
import { mediaRepository } from '@/lib/db/repositories/media.repo';
import { generationErrorCode } from '@/lib/errors/fail';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { searchParams } = new URL(request.url);
  const parsed = mediaListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const rows = await mediaRepository.list({ q: parsed.data.q, type: parsed.data.type, folder: parsed.data.folder });
  return ok({ media: rows.map((r) => ({ ...r, variants: r.variants ? JSON.parse(r.variants) : null })) });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:media`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('INVALID_FORM', 'Expected multipart form-data', 400);
  }
  const file = form.get('file');
  if (!(file instanceof Blob)) return fail('FILE_REQUIRED', 'Field "file" is required', 400);
  const metaParsed = mediaUploadMetaSchema.safeParse({
    alt_text: form.get('alt_text')?.toString() || undefined,
    folder: form.get('folder')?.toString() || undefined,
  });
  if (!metaParsed.success) return failZod(metaParsed.error);
  try {
    const result = await mediaService.upload(
      payload.sub, (file as File).name || 'upload.bin', file.type || 'application/octet-stream',
      new Uint8Array(await file.arrayBuffer()),
      { altText: metaParsed.data.alt_text, folder: metaParsed.data.folder ?? null }
    );
    return ok(result, undefined, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'ALT_REQUIRED' || code === 'INVALID_FILE' || code === 'FILE_TOO_LARGE') {
      return fail(code, (err as Error).message, code === 'FILE_TOO_LARGE' ? 413 : 422);
    }
    return fail('INTERNAL_ERROR', 'Upload failed', 500);
  }
}

export async function PATCH(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail('ID_REQUIRED', 'Query param id is required', 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = mediaPatchSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const row = await mediaRepository.findById(id);
  if (!row) return notFound();
  await mediaRepository.update(id, { altText: parsed.data.alt_text, folder: parsed.data.folder });
  return ok({ id });
}

export async function DELETE(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail('ID_REQUIRED', 'Query param id is required', 400);
  try {
    await mediaService.remove(id);
    return ok({ deleted: true });
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'REFERENCED') return fail(code, (err as Error).message, 409);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
