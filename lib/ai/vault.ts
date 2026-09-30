import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env } from '@/lib/env';

// §6.6 key vault: AES-256-GCM with a key derived from ENCRYPTION_KEY.
// Plaintext is NEVER persisted — only the JSON bundle below reaches the DB,
// and only key_hint (prefix + last 4) is ever returned by APIs.

export interface KeyBundle {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

function keyMaterial(): Buffer {
  return createHash('sha256').update(env.ENCRYPTION_KEY, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  const key = keyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const bundle: KeyBundle = {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  };
  return JSON.stringify(bundle);
}

export function decryptSecret(bundleJson: string): string {
  const bundle = JSON.parse(bundleJson) as KeyBundle;
  if (bundle.v !== 1 || !bundle.iv || !bundle.tag || !bundle.data) {
    throw new Error('INVALID_KEY_BUNDLE');
  }
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(bundle.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(bundle.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(bundle.data, 'base64')), decipher.final()]).toString('utf8');
}

// key_hint = first 3 chars + '…' + last 4 (e.g. 'sk-…1234'). Safe for UI/logs.
export function makeKeyHint(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (trimmed.length <= 8) return '…' + trimmed.slice(-4);
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-4)}`;
}
