// §5.4 transport: explicit timeouts + exponential backoff on 429/5xx.
// Non-retryable client errors (auth, bad request) fail fast.

export const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class ProviderHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Provider HTTP ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body.slice(0, 2000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 2000) };
    }
    return { status: res.status, json };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ProviderHttpError(504, 'Provider request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Retries network errors + 429/5xx with exponential backoff + jitter.
// 504s synthesized above (timeouts) are retryable; auth/4xx fail fast.
export async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable =
        !(err instanceof ProviderHttpError) ||
        err.status === 429 ||
        err.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) throw err;
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
      await sleep(delay);
    }
  }
  throw lastError;
}
