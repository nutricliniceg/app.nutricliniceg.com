import { describe, it, expect } from 'vitest';
import { checkMagic } from '@/lib/files/magic';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const SCRIPT = new TextEncoder().encode('#!/bin/bash\necho pwned');

describe('magic-byte verification (§6.5)', () => {
  it('accepts genuine JPEG/PNG/WebP/PDF', () => {
    expect(checkMagic(JPEG, 'image/jpeg').ok).toBe(true);
    expect(checkMagic(PNG, 'image/png').ok).toBe(true);
    expect(checkMagic(WEBP, 'image/webp').ok).toBe(true);
    expect(checkMagic(PDF, 'application/pdf').ok).toBe(true);
  });

  it('rejects a script renamed to .jpg', () => {
    const r = checkMagic(SCRIPT, 'image/jpeg');
    expect(r.ok).toBe(false);
    expect(r.realMime).toBeNull();
  });

  it('rejects MIME mismatch (PNG bytes claimed as JPEG)', () => {
    const r = checkMagic(PNG, 'image/jpeg');
    expect(r.ok).toBe(false);
    expect(r.realMime).toBe('image/png');
    expect(r.reason).toContain('mismatch');
  });

  it('rejects disallowed MIME types', () => {
    const r = checkMagic(JPEG, 'image/gif');
    expect(r.ok).toBe(false);
  });
});
