// Shared client-side API reader (was copy-pasted in 17 components).
// Response envelope matches lib/api/response.ts ok()/fail().

// Carries the envelope `error.code` so callers can map a machine code to an
// i18n message. Extends Error, so every existing `e instanceof Error ? e.message`
// consumer keeps working unchanged.
export class ApiRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
  }
}

export async function readApi<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { success: boolean; data: T; error?: { code?: string; message?: string } };
  if (!body.success) throw new ApiRequestError(body.error?.code ?? 'UNKNOWN', body.error?.message ?? 'Request failed');
  return body.data;
}