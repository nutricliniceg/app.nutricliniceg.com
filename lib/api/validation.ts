import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, failZod } from './response';

export const uuidSchema = z.string().uuid({ message: 'Invalid UUID format' });

export const emailSchema = z.string().email({ message: 'Invalid email format' });

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

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