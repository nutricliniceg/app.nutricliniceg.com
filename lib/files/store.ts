// Secure file storage (§6.5).
// Files live OUTSIDE webroot under STORAGE_DIR (e.g. /home/user/storage/uploads).
// OPERATIONS NOTE (cPanel): create the directory once with no execute bit, e.g.
//   mkdir -p /home/user/storage/uploads && chmod 700 /home/user/storage/uploads
// Filenames are UUID-generated; user-supplied names are stored as metadata only.
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { AllowedMime } from './magic';

export function storageDir(): string {
  return process.env.STORAGE_DIR || path.join(process.cwd(), '.data', 'uploads');
}

export function extensionFor(mime: AllowedMime): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'pdf';
}

export async function saveBuffer(bytes: Uint8Array, mime: AllowedMime): Promise<string> {
  const dir = storageDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const name = `${randomUUID()}.${extensionFor(mime)}`;
  await fs.writeFile(path.join(dir, name), bytes, { mode: 0o600 });
  return name;
}

export async function readBuffer(storedName: string): Promise<Buffer> {
  if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
    throw new Error('Invalid stored name');
  }
  return fs.readFile(path.join(storageDir(), storedName));
}

export async function deleteStored(storedName: string): Promise<void> {
  try {
    await fs.unlink(path.join(storageDir(), storedName));
  } catch {
    // Already gone — idempotent.
  }
}

export async function reencodeImage(bytes: Uint8Array, mime: AllowedMime): Promise<Buffer> {
  if (mime === 'application/pdf') return Buffer.from(bytes);
  const sharp = (await import('sharp')).default;
  const pipeline = sharp(bytes).rotate();
  if (mime === 'image/jpeg') return pipeline.jpeg({ quality: 88 }).toBuffer();
  if (mime === 'image/png') return pipeline.png().toBuffer();
  return pipeline.webp({ quality: 88 }).toBuffer();
}
