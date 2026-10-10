import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, failZod } from './response';

/** Canonical UUID field validator, reused across API boundaries (hard invariant #1). */
export const uuidSchema = z.string().uuid({ message: 'Invalid UUID format' });

// NOTE: email / pagination / date-range fragments are intentionally NOT defined
// here. They already have one owner each (lib/auth/auth.schema.ts and the
// per-feature *.schema.ts modules); a parallel copy here would be exactly the
// duplicate-schema drift this module is meant to prevent. Add a fragment to
// the owning feature schema instead.

export function parseJsonBody<T>(schema: z.ZodSchema<T>) {
  return async (request: Request): Promise<{ data: T } | NextResponse> => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail('INVALID_JSON', 'Invalid JSON body', 400);
    }
    const result = schema.safeParse(body);
    if (!result.success) return failZod(result.error);
    return { data: result.data };
  };
}

export function validateQueryParams<T>(schema: z.ZodSchema<T>, searchParams: URLSearchParams): { data: T } | NextResponse {
  const obj: Record<string, string | string[]> = {};
  searchParams.forEach((value, key) => {
    if (obj[key] !== undefined) {
      if (Array.isArray(obj[key])) {
        (obj[key] as string[]).push(value);
      } else {
        obj[key] = [obj[key] as string, value];
      }
    } else {
      obj[key] = value;
    }
  });

  const result = schema.safeParse(obj);
  if (!result.success) return failZod(result.error);
  return { data: result.data };
}