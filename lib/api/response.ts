import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export type ApiResult<T> = { success: true; data: T; meta?: Record<string, unknown> } | { success: false; error: ApiError };

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data, meta }, { status });
}

export function fail(code: string, message: string, status = 400, details?: Record<string, string[]>): NextResponse {
  return NextResponse.json<{ success: false; error: ApiError }>({ success: false, error: { code, message, details } }, { status });
}

export function failZod(error: ZodError, status = 400): NextResponse {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!details[path]) details[path] = [];
    details[path].push(issue.message);
  }
  return fail('VALIDATION_ERROR', 'Invalid request payload', status, details);
}

export function unauthorized(message = 'Unauthorized'): NextResponse {
  return fail('UNAUTHORIZED', message, 401);
}

export function forbidden(message = 'Forbidden'): NextResponse {
  return fail('FORBIDDEN', message, 403);
}

export function notFound(message = 'Resource not found'): NextResponse {
  return fail('NOT_FOUND', message, 404);
}

export function serverError(message = 'Internal server error'): NextResponse {
  return fail('INTERNAL_ERROR', message, 500);
}

export function tooManyRequests(message = 'Too many requests'): NextResponse {
  return fail('RATE_LIMITED', message, 429);
}