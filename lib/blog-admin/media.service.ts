import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { mediaRepository } from '@/lib/db/repositories/media.repo';
import { checkMagic, maxBytesFor } from '@/lib/files/magic';
import { fail } from '@/lib/plans';

function mediaDir(): string {
  return process.env.STORAGE_DIR
    ? path.join(process.env.STORAGE_DIR, 'media')
    : path.join(process.cwd(), '.data', 'media');
}

export interface MediaVariantSet {
  original: string;
  thumb: string;
  medium: string;
  large: string;
}

// BLG-21: WebP conversion + thumb/medium/large variants, recorded in JSON.
export async function buildVariants(bytes: Uint8Array): Promise<{ files: MediaVariantSet; width: number | null; height: number | null }> {
  const base = sharp(bytes).rotate();
  const meta = await base.metadata();
  const dir = mediaDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const name = (suffix: string): string => `${randomUUID()}-${suffix}.webp`;
  const files: MediaVariantSet = { original: name('orig'), thumb: name('thumb'), medium: name('med'), large: name('large') };
  await Promise.all([
    fs.writeFile(path.join(dir, files.original), await base.clone().webp({ quality: 86 }).toBuffer(), { mode: 0o600 }),
    fs.writeFile(path.join(dir, files.thumb), await base.clone().resize(320, 320, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(), { mode: 0o600 }),
    fs.writeFile(path.join(dir, files.medium), await base.clone().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(), { mode: 0o600 }),
    fs.writeFile(path.join(dir, files.large), await base.clone().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer(), { mode: 0o600 }),
  ]);
  return { files, width: meta.width ?? null, height: meta.height ?? null };
}

export const mediaService = {
  async upload(uploaderId: string, originalName: string, claimedMime: string, bytes: Uint8Array, meta: { altText: string; folder?: string | null }) {
    // BLG-20: alt text is mandatory, enforced before any storage.
    if (!meta.altText || meta.altText.trim().length < 2) throw fail('ALT_REQUIRED', 'Alt text is required for every upload');
    const check = checkMagic(bytes, claimedMime);
    if (!check.ok || !check.realMime) throw fail('INVALID_FILE', check.reason ?? 'File rejected');
    if (!check.realMime.startsWith('image/')) throw fail('INVALID_FILE', 'Media library accepts images only');
    if (bytes.length > maxBytesFor(check.realMime)) throw fail('FILE_TOO_LARGE', 'Image limit is 10MB');
    const { files, width, height } = await buildVariants(bytes);
    const url = '';
    const id = await mediaRepository.insert({
      uploaderId, filename: files.large, originalName: originalName.slice(0, 255),
      mime: 'image/webp', sizeBytes: bytes.length, width, height,
      altText: meta.altText.trim(), folder: meta.folder?.trim() || null,
      url, variants: files,
    });
    const publicUrl = `/api/media/${id}`;
    await mediaRepository.setUrl(id, publicUrl);
    return { id, url: publicUrl, variants: files };
  },

  async remove(id: string): Promise<void> {
    const row = await mediaRepository.findById(id);
    if (!row) throw fail('NOT_FOUND', 'Media not found');
    const refs = await mediaRepository.referenceCount(`/api/media/${id}`);
    if (refs > 0) throw fail('REFERENCED', 'Media is used by published content and cannot be deleted');
    const variants = row.variants ? (JSON.parse(row.variants) as Partial<MediaVariantSet>) : {};
    const dir = mediaDir();
    for (const file of [row.filename, variants.original, variants.thumb, variants.medium, variants.large]) {
      if (!file || file.includes('/') || file.includes('..')) continue;
      try {
        await fs.unlink(path.join(dir, file));
      } catch {
        // Already gone — idempotent.
      }
    }
    await mediaRepository.remove(id);
  },
};
