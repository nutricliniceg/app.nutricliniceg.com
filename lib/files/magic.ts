export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

function sniff(bytes: Uint8Array): AllowedMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
    return null;
  }
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return 'application/pdf';
  }
  return null;
}

export interface MagicCheck {
  ok: boolean;
  realMime: AllowedMime | null;
  reason?: string;
}

export function checkMagic(bytes: Uint8Array, claimedMime: string): MagicCheck {
  const realMime = sniff(bytes);
  if (!realMime) return { ok: false, realMime: null, reason: 'Unrecognized file signature' };
  if (!(ALLOWED_MIME as readonly string[]).includes(claimedMime)) {
    return { ok: false, realMime, reason: `MIME ${claimedMime} is not allowed` };
  }
  if (realMime !== claimedMime) {
    return { ok: false, realMime, reason: `Extension/MIME mismatch: real type is ${realMime}` };
  }
  return { ok: true, realMime };
}

export function maxBytesFor(mime: AllowedMime): number {
  return mime === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
}
