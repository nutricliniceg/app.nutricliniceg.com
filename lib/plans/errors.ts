// Single service-error factory lives in lib/errors/fail.ts (quality gate:
// 6 identical local copies removed). This module keeps the plans-domain
// names AND the original 'GENERATION_FAILED' fallback so existing importers
// observe byte-identical behavior.
export { serviceFail as fail, serviceErrorExtra as generationErrorExtra } from '@/lib/errors/fail';

export function generationErrorCode(err: unknown): string {
  return (err as { code?: string }).code ?? 'GENERATION_FAILED';
}
