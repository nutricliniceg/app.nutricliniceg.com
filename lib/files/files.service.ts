import { randomUUID } from 'crypto';
import { filesRepository } from '@/lib/db/repositories/files.repo';
import { checkMagic, maxBytesFor, type AllowedMime } from './magic';
import { saveBuffer, readBuffer, reencodeImage } from './store';
import { mintFileToken, verifyFileToken } from './signed-url';
import { serviceFail as fail } from '@/lib/errors/fail';
import type { UploadMeta } from './files.schema';

export interface UploadResult {
  fileId: string;
  mime: AllowedMime;
  sizeBytes: number;
  signedUrl: string;
}

export const filesService = {
  async upload(ownerId: string, originalName: string, claimedMime: string, bytes: Uint8Array, meta: UploadMeta): Promise<UploadResult> {
    const check = checkMagic(bytes, claimedMime);
    if (!check.ok || !check.realMime) throw fail('INVALID_FILE', check.reason ?? 'File rejected');
    const mime: AllowedMime = check.realMime;
    if (bytes.length > maxBytesFor(mime)) {
      throw fail('FILE_TOO_LARGE', mime === 'application/pdf' ? 'PDF limit is 20MB' : 'Image limit is 10MB');
    }
    const clean = await reencodeImage(bytes, mime);
    const storedName = await saveBuffer(clean, mime);
    const fileId = randomUUID();
    await filesRepository.insert({
      id: fileId,
      ownerId,
      patientId: meta.patient_id ?? null,
      purpose: meta.purpose,
      storedName,
      originalName: originalName.slice(0, 255),
      mime,
      sizeBytes: clean.length,
    });
    return { fileId, mime, sizeBytes: clean.length, signedUrl: `/api/files/${fileId}?token=${mintFileToken(fileId, ownerId)}` };
  },

  async download(fileId: string, token: string): Promise<{ bytes: Buffer; mime: string; filename: string }> {
    const verified = verifyFileToken(token);
    if (!verified || verified.fileId !== fileId) throw fail('INVALID_LINK', 'Download link is invalid or expired');
    const row = await filesRepository.findById(fileId);
    if (!row || row.owner_id !== verified.ownerId) throw fail('NOT_FOUND', 'File not found');
    const bytes = await readBuffer(row.stored_name);
    return { bytes, mime: row.mime, filename: row.original_name };
  },

  async listPatientFiles(ownerId: string, patientId: string) {
    const rows = await filesRepository.listByPatient(ownerId, patientId);
    return rows.map((r) => ({
      id: r.id,
      purpose: r.purpose,
      originalName: r.original_name,
      mime: r.mime,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
      signedUrl: `/api/files/${r.id}?token=${mintFileToken(r.id, ownerId)}`,
    }));
  },
};

export function uploadErrorCode(err: unknown): string {
  return (err as { code?: string }).code ?? 'UPLOAD_FAILED';
}
