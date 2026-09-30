import { randomBytes } from 'crypto';

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

// 48h single-use confirm window, measured from row creation (refreshed on
// every re-request so the window follows the latest email).
export const CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;

export function confirmExpired(createdAt: Date | string, now = Date.now()): boolean {
  return now - new Date(createdAt).getTime() > CONFIRM_TTL_MS;
}

// Minimal CSV: header + quoted fields (import/export round-trip tested).
export function parseSubscriberCsv(text: string): Array<{ email: string; name: string | null; locale: string }> {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0].toLowerCase());
  const emailIdx = header.indexOf('email');
  if (emailIdx === -1) return [];
  const nameIdx = header.indexOf('name');
  const localeIdx = header.indexOf('locale');
  const out: Array<{ email: string; name: string | null; locale: string }> = [];
  for (const line of lines.slice(1, 10001)) {
    const cols = splitCsvLine(line);
    const email = (cols[emailIdx] ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    const locale = (cols[localeIdx] ?? '').trim().toLowerCase() === 'en' ? 'en' : 'ar';
    out.push({ email, name: (cols[nameIdx] ?? '').trim() || null, locale });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cols.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function csvCell(value: string | null): string {
  const v = value ?? '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function subscribersToCsv(rows: Array<{ email: string; name: string | null; locale: string; status: string }>): string {
  const lines = ['email,name,locale,status'];
  for (const r of rows) lines.push([csvCell(r.email), csvCell(r.name), csvCell(r.locale), csvCell(r.status)].join(','));
  return lines.join('\n') + '\n';
}
