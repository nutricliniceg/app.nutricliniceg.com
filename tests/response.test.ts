import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';

describe('api response helpers', () => {
  it('ok() wraps data with success:true', async () => {
    const res = ok({ a: 1 }, { message: 'hi' }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, data: { a: 1 }, meta: { message: 'hi' } });
  });

  it('fail() uses the success:false envelope', async () => {
    const res = fail('E_CODE', 'bad', 422, { f: ['x'] });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      success: false,
      error: { code: 'E_CODE', message: 'bad', details: { f: ['x'] } },
    });
  });

  it('failZod() groups issues by path', async () => {
    const parsed = z.object({ email: z.string().email() }).safeParse({ email: 'nope' });
    if (parsed.success) throw new Error('unreachable');
    const res = failZod(parsed.error);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.email.length).toBeGreaterThan(0);
  });

  it('shortcuts carry the right status', () => {
    expect(unauthorized().status).toBe(401);
    expect(notFound().status).toBe(404);
  });
});
