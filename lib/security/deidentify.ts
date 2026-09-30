// CMP-11 de-identification (pure). Two layers:
// 1. literal stripping of known secrets (patient name etc. — regex cannot
//    catch names, so the context builder passes them explicitly);
// 2. pattern scrub for emails, phone runs, and national-ID runs.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\+?20?1[0125]\d{8}/g;
const PHONE_GENERIC = /\b\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g;
const NATIONAL_ID = /\b\d{14}\b/g;

export function scrubPatterns(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[phone]')
    .replace(NATIONAL_ID, '[national-id]')
    .replace(PHONE_GENERIC, '[phone]');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripSecrets(text: string, secrets: Array<string | null | undefined>): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret) continue;
    const needle = secret.trim();
    if (needle.length < 2) continue;
    out = out.replace(new RegExp(escapeRegExp(needle), 'gi'), '[redacted]');
    // Multi-word names: also strip each significant token (≥3 chars) so
    // "Ahmed Samy" is gone even when split across the payload.
    for (const token of needle.split(/\s+/)) {
      if (token.length >= 3) out = out.replace(new RegExp(escapeRegExp(token), 'gi'), '[redacted]');
    }
  }
  return out;
}

// Full outbound hygiene: patterns first (so a name token inside an email
// cannot break email matching), then literal secrets.
export function deidentify(text: string, secrets: Array<string | null | undefined> = []): string {
  return stripSecrets(scrubPatterns(text), secrets);
}
