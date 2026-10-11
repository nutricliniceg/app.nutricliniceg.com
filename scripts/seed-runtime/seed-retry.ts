// P32-SEED — retry + failure reporting for connection-class DB errors.
//
// Only transport-level failures are retried. Constraint, validation and
// duplicate-key errors are surfaced immediately: retrying those cannot help
// and would only slow the run down.
//
// The seed is idempotent (plans keyed on name_en, foods on name_ar, posts on
// (slug, locale), templates on name), so re-running an operation that may have
// partially applied is safe — the upsert path converges on the same rows.

const CONNECTION_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EPIPE',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'PROTOCOL_ENQUEUE_AFTER_QUIT',
  'ER_CON_COUNT_ERROR',
  'ER_SERVER_SHUTDOWN',
]);

const CONNECTION_MESSAGES = [
  'Connection lost',
  'server closed the connection',
  'Connection refused',
  'Lost connection',
  'Not connected',
  'Connection timeout',
  'max connect timeout',
  'Connection queue full',
  'closed the connection unexpectedly',
];

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (typeof e.code === 'string' && CONNECTION_CODES.has(e.code)) return true;
  const msg = String(e.message ?? '');
  return CONNECTION_MESSAGES.some((m) => msg.includes(m));
}

/** Full diagnostic dump: every field asked for, plus the failing statement. */
export function reportFailure(label: string, err: unknown, fallbackSql?: string): void {
  const e = (err ?? {}) as {
    name?: string;
    message?: string;
    code?: string;
    errno?: number | string;
    sqlState?: string;
    sql?: string;
    sqlMessage?: string;
    fatal?: boolean;
    seedSql?: string;
    seedParams?: string;
    stack?: string;
  };
  const sql = e.seedSql ?? fallbackSql;
  console.error('\n================ SEED FAILURE ================');
  console.error(`operation : ${label}`);
  console.error(`name     : ${e.name ?? '(none)'}`);
  console.error(`message  : ${e.message ?? '(none)'}`);
  console.error(`code     : ${e.code ?? '(none)'}`);
  console.error(`errno    : ${e.errno ?? '(none)'}`);
  console.error(`sqlState : ${e.sqlState ?? '(none)'}`);
  console.error(`fatal    : ${e.fatal ?? '(none)'}`);
  if (e.sqlMessage) console.error(`sqlMessage: ${e.sqlMessage}`);
  console.error(`sql      : ${sql ?? '(not captured)'}`);
  if (e.seedParams) console.error(`params   : ${e.seedParams}`);
  if (e.stack) {
    console.error('stack    :');
    console.error(
      e.stack
        .split('\n')
        .slice(0, 6)
        .map((l) => `  ${l}`)
        .join('\n'),
    );
  }
  console.error('===============================================\n');
}

export interface RetryOptions {
  retries?: number;
  delayMs?: number;
}

/**
 * Runs `fn`, retrying once after `delayMs` on a connection-class error.
 * Non-connection errors, and the final attempt, are reported and rethrown.
 */
export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 1;
  const delayMs = options.delayMs ?? 3000;
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isConnectionError(err) || attempt >= retries) {
        reportFailure(label, err);
        throw err;
      }
      attempt += 1;
      const e = err as { code?: string; message?: string };
      console.warn(
        `  [retry ${attempt}/${retries}] ${label}: connection error ` +
          `(${e.code ?? 'no code'}): ${e.message ?? 'unknown'} — retrying in ${delayMs}ms`,
      );
      await delay(delayMs);
    }
  }
}