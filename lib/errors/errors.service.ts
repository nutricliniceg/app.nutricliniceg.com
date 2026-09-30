import { errorsRepository } from '@/lib/db/repositories/errors.repo';
import { scrubPatterns } from '@/lib/security/deidentify';
import type { ClientErrorInput } from './errors.schema';

// OBS-05: client reports must never carry PHI. Strip emails, phone numbers,
// 14-digit national-ID runs, and truncate before persisting.
export function scrubPhi(message: string): string {
  return scrubPatterns(message).slice(0, 2000);
}

export const errorsService = {
  async reportClientError(userId: string | null, input: ClientErrorInput): Promise<void> {
    await errorsRepository.insert({
      level: input.level,
      source: 'client:' + input.source,
      message: scrubPhi(input.message),
      path: input.path ?? null,
      userId,
    });
  },
};
