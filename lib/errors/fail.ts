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
