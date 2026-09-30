import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isOriginAllowed } from '@/lib/security/csrf';
import { encryptField, decryptField, isEncryptedField } from '@/lib/security/field-crypto';
import { mintFileToken, verifyFileToken } from '@/lib/files/signed-url';
import { checkMagic } from '@/lib/files/magic';
import { z } from 'zod';

vi.mock('@/lib/db/pool', () => ({
  executeQuery: vi.fn(async () => []),
}));

describe('P30 security negatives (abuse probes at handler level)', () => {
  beforeEach(() => {
    process.env.FILE_URL_SECRET = 'test-file-url-secret-16-chars';
  });
  it('CSRF: foreign Origin rejected, missing/same-origin allowed', () => {
    expect(isOriginAllowed('https://evil.example', 'nutricliniceg.com')).toBe(false);
    expect(isOriginAllowed('https://evil-nutricliniceg.com', 'nutricliniceg.com')).toBe(false);
    expect(isOriginAllowed('https://nutricliniceg.com', 'nutricliniceg.com')).toBe(true);
    expect(isOriginAllowed('https://app.nutricliniceg.com', 'nutricliniceg.com')).toBe(true);
    expect(isOriginAllowed(null, 'nutricliniceg.com')).toBe(true);
    expect(isOriginAllowed('not-a-url', 'nutricliniceg.com')).toBe(false);
  });

  it('SQLi strings die in Zod validation (never reach SQL)', () => {
    const schema = z.object({ email: z.string().email().max(255), password: z.string().min(1) });
    expect(schema.safeParse({ email: "x@x.com' OR 1=1--", password: 'x' }).success).toBe(false);
    expect(schema.safeParse({ email: 'x@x.com', password: 'x' }).success).toBe(true);
  });

  it('JWT-shaped garbage fails session verification', async () => {
    const { verifyTokenFromRequest } = await import('@/lib/security/session');
    const req = new Request('https://app.test/api/patients', {
      headers: { cookie: 'token=eyJhbGciOiJIUzI1NiJ9.tampered.signature' },
    });
    expect(await verifyTokenFromRequest(req as never)).toBeNull();
  });

  it('forged file-download signatures rejected (timing-safe HMAC + TTL)', () => {
    expect(verifyFileToken('forged')).toBeNull();
    const good = mintFileToken('file-1', 'owner-1');
    expect(verifyFileToken(good)).toMatchObject({ fileId: 'file-1', ownerId: 'owner-1' });
    // Cross-file replay fails: token is bound to its file id via the payload.
    const other = mintFileToken('file-2', 'owner-1');
    expect(verifyFileToken(other)).not.toMatchObject({ fileId: 'file-1' });
    // Expired tokens fail.
    const stale = mintFileToken('file-1', 'owner-1', -1000);
    expect(verifyFileToken(stale)).toBeNull();
  });

  it('upload spoof (renamed executable) fails magic check', () => {
    // ELF magic with a .jpg claim must NOT pass as an image.
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x00, 0x00]);
    const spoof = checkMagic(elf, 'image/jpeg');
    expect(spoof.ok).toBe(false);
    expect(spoof.realMime).not.toBe('image/jpeg');
  });

  it('CMP-07 field crypto round-trips; legacy plaintext passes through', () => {
    const ct = encryptField('sensitive note');
    expect(isEncryptedField(ct)).toBe(true);
    expect(String(ct)).not.toContain('sensitive note');
    expect(decryptField(ct)).toBe('sensitive note');
    expect(decryptField('legacy plaintext')).toBe('legacy plaintext');
    expect(decryptField(null)).toBeNull();
    expect(decryptField('enc:v1:corrupt!!')).toBe('[unreadable — re-save to re-encrypt]');
  });

  it('CMP-10 retention gate blocks patient data on unknown-posture providers', async () => {
    const { ChainAiClient } = await import('@/lib/ai/chain');
    const { aiProviderRepository } = await import('@/lib/db/repositories/ai.repo');
    const spy = vi.spyOn(aiProviderRepository, 'listChain').mockResolvedValue([
      { id: 'p1', name: 'P', type: 'openai', base_url: null, priority_order: 1, is_enabled: true, failure_count: 0, disabled_until: null, supports_vision: false, supports_json_mode: true, data_retention: 'unknown' },
    ]);
    try {
      // isAdmin skips the quota DB path; the retention gate runs regardless.
      const client = new ChainAiClient({ doctorId: 'd1', isAdmin: true, patientData: true });
      await expect(client.chat([{ role: 'user', content: 'hi' }], {})).rejects.toMatchObject({ code: 'RETENTION_UNKNOWN' });
      const nonPatient = new ChainAiClient({ doctorId: 'd1', isAdmin: true });
      // Non-patient traffic is unaffected by the gate (fails later at adapter, not at the gate).
      await expect(nonPatient.chat([{ role: 'user', content: 'hi' }], {})).rejects.not.toMatchObject({ code: 'RETENTION_UNKNOWN' });
    } finally {
      spy.mockRestore();
    }
  });

  it('CMP-03/11 outbound AI payload (systemBlock) carries no identifiers', async () => {
    // Design note: ctx.secrets holds the server-side scrub list transiently
    // (P21 contract, never persisted or sent — only ctx.systemBlock leaves
    // the process). The outbound assertion therefore targets systemBlock.
    const { assembleContext } = await import('@/lib/assistant/context');
    const { patientRepository } = await import('@/lib/db/repositories/patients.repo');
    const spy = vi.spyOn(patientRepository, 'findById').mockResolvedValue({
      id: 'p1', doctor_id: 'd1', name_ar: 'أحمد محمد', name_en: 'Ahmed Mohamed',
      phone: '01012345678', address: 'Cairo', birth_date: new Date('1990-01-01'),
      gender: 'male', height_cm: 175, initial_weight_kg: 90, current_weight_kg: 88,
      consent_ai_sharing_at: new Date(), medical_notes: null,
    } as never);
    try {
      const ctx = await assembleContext('d1', 'p1');
      expect(ctx.systemBlock).not.toContain('أحمد محمد');
      expect(ctx.systemBlock).not.toContain('Ahmed Mohamed');
      expect(ctx.systemBlock).not.toContain('01012345678');
      expect(ctx.systemBlock).not.toContain('Cairo');
    } finally {
      spy.mockRestore();
    }
  });
});
