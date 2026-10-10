// Single service-error factory (was copy-pasted in 6 services).
// Services throw these; route handlers map code → HTTP via fail().
export function serviceFail(code: string, message: string, extra?: Record<string, unknown>): Error {
  const err = new Error(message);
  Object.assign(err as Error & { code?: string; extra?: Record<string, unknown> }, { code, extra });
  return err;
}

export function serviceErrorCode(err: unknown): string {
  return (err as { code?: string }).code ?? 'SERVICE_FAILED';
}

export function serviceErrorExtra(err: unknown): Record<string, unknown> | undefined {
  return (err as { extra?: Record<string, unknown> }).extra;
}

/**
 * Shared cross-feature error-code reader. Every feature's service throws via
 * `serviceFail`; ~70 route handlers across plans, patients, billing, admin,
 * portal, messaging, templates and the AI assistant map that code to HTTP.
 * It lives HERE (shared infrastructure) rather than in lib/plans, which would
 * force every feature to import the plans feature's internals to read an
 * error code (architecture rule: no feature imports another feature's
 * internals).
 *
 * `fallback` preserves the historical per-domain default: callers that used
 * the plans-domain helper keep observing 'GENERATION_FAILED'.
 */
export function errorCodeOf(err: unknown, fallback = 'SERVICE_FAILED'): string {
  return (err as { code?: string }).code ?? fallback;
}

/** Plans-domain alias kept for existing importers (byte-identical behavior). */
export const generationErrorCode = (err: unknown): string => errorCodeOf(err, 'GENERATION_FAILED');
export const generationErrorExtra = serviceErrorExtra;
