// Single service-error factory lives in lib/errors/fail.ts (quality gate:
// 6 identical local copies removed). This module keeps the plans-domain
// names AND the original 'GENERATION_FAILED' fallback so existing importers
// observe byte-identical behavior.
export { serviceFail as fail } from '@/lib/errors/fail';
export { generationErrorCode, generationErrorExtra } from '@/lib/errors/fail';