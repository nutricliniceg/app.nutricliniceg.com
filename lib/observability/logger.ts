// OBS-03: structured JSON logger. Every line is one JSON object:
// { ts, level, msg, requestId?, ...fields }. PHI must never reach it —
// callers scrub first (scrubPhi / deidentify).
import { randomUUID } from 'crypto';

let currentRequestId: string | null = null;

export function setRequestId(id: string | null): void {
  currentRequestId = id;
}

export function getRequestId(): string | null {
  return currentRequestId;
}

export function newRequestId(): string {
  return randomUUID();
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(currentRequestId ? { requestId: currentRequestId } : {}),
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};
