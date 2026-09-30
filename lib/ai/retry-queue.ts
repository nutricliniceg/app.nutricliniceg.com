import type { RetryStatus } from '@/lib/db/repositories/ai.repo';
import { aiRetryRepository } from '@/lib/db/repositories/ai.repo';

// AI-12: degradation queue. When every provider fails, the chain enqueues the
// request payload here; CRON-14 (P29) drains it via processRetryQueue().
// After MAX_ATTEMPTS the item becomes a dead letter for admin inspection.
export const MAX_RETRY_ATTEMPTS = 5;

export async function enqueueRetryRequest(
  id: string,
  doctorId: string | null,
  requestType: string,
  payload: unknown
): Promise<void> {
  await aiRetryRepository.enqueue(id, doctorId, requestType, payload);
}

export interface RetryOutcome {
  processed: number;
  succeeded: number;
  requeued: number;
  deadLettered: number;
}

export async function processRetryQueue(
  limit: number,
  worker: (requestType: string, payload: unknown) => Promise<void>
): Promise<RetryOutcome> {
  const outcome: RetryOutcome = { processed: 0, succeeded: 0, requeued: 0, deadLettered: 0 };
  const due = await aiRetryRepository.claimDue(limit);
  for (const item of due) {
    outcome.processed += 1;
    await aiRetryRepository.markProcessing(item.id);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(item.payload);
    } catch {
      await aiRetryRepository.markDeadLetter(item.id, 'Unparseable payload');
      outcome.deadLettered += 1;
      continue;
    }
    try {
      await worker(item.request_type, parsed);
      await aiRetryRepository.markDone(item.id);
      outcome.succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Retry worker failed';
      if (item.attempts + 1 >= MAX_RETRY_ATTEMPTS) {
        await aiRetryRepository.markDeadLetter(item.id, message);
        outcome.deadLettered += 1;
      } else {
        await aiRetryRepository.markRequeued(item.id, message);
        outcome.requeued += 1;
      }
    }
  }
  return outcome;
}

export type { RetryStatus };
