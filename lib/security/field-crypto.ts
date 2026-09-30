import { encryptSecret, decryptSecret } from '@/lib/ai/vault';

// CMP-07: field-level encryption for sensitive medical text at rest
// (visit notes, lab values, patient notes). AES-256-GCM via the AI-key
// vault primitives; values are prefixed so readers can distinguish
// ciphertext from legacy plaintext (transparent, migrates on next write).
const PREFIX = 'enc:v1:';

export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  if (plaintext === '') return '';
  return PREFIX + encryptSecret(plaintext);
}

// Never throws: legacy plaintext passes through untouched; corrupt
// ciphertext surfaces as a redaction marker instead of breaking the page.
export function decryptField(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined) return null;
  if (stored === '' || !stored.startsWith(PREFIX)) return stored;
  try {
    return decryptSecret(stored.slice(PREFIX.length));
  } catch {
    return '[unreadable — re-save to re-encrypt]';
  }
}

export function isEncryptedField(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}
