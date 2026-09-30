import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { getClientIp, getRequestMeta } from '@/lib/api/request-meta';
import { parseJsonBody, validateQueryParams } from '@/lib/api/validation';

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/x?page=2', { headers: new Headers(headers) });
}

describe('request-meta', () => {
  it('takes the first forwarded IP', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
    expect(getClientIp(req())).toBe('unknown');
  });

  it('builds audit metadata', () => {
    expect(getRequestMeta(req({ 'x-forwarded-for': '9.9.9.9', 'user-agent': 'jest' }))).toEqual({
      ip: '9.9.9.9',
      userAgent: 'jest',
    });
  });
});

describe('validation helpers', () => {
  it('parseJsonBody validates payloads', async () => {
    const schema = z.object({ name: z.string().min(2) });
    const mk = (body: string) =>
      new Request('http://localhost/api/x', {
        method: 'POST',
        headers: new Headers({ 'content-type': 'application/json' }),
        body,
      });
    const good = await parseJsonBody(schema)(mk(JSON.stringify({ name: 'ok' })));
    expect(good).toEqual({ data: { name: 'ok' } });
    const bad = await parseJsonBody(schema)(mk(JSON.stringify({ name: 'x' })));
    expect(bad instanceof Response).toBe(true);
    const broken = await parseJsonBody(schema)(mk('not-json'));
    expect(broken instanceof Response).toBe(true);
  });

  it('validateQueryParams coerces and rejects', () => {
    const schema = z.object({ page: z.coerce.number().int().positive().default(1) });
    const good = validateQueryParams(schema, new URLSearchParams('page=3'));
    expect(good).toMatchObject({ data: { page: 3 } });
    const bad = validateQueryParams(schema, new URLSearchParams('page=nope'));
    expect(bad instanceof Response).toBe(true);
  });
});
