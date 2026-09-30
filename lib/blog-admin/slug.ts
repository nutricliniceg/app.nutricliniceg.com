// Arabic-aware slug generation (URL-safe transliteration). Uniqueness is
// enforced per (slug, locale) to match the DB unique key.

const AR_MAP: Record<string, string> = {
  'أ': 'a', 'إ': 'i', 'آ': 'a', 'ا': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'ة': 'a', 'و': 'w', 'ى': 'a', 'ي': 'y', 'ئ': 'e', 'ؤ': 'o',
  'ء': '', ' ': '-', '_': '-',
};

export function slugifyTitle(title: string): string {
  let out = '';
  for (const ch of title.trim()) {
    if (AR_MAP[ch] !== undefined) {
      out += AR_MAP[ch];
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    } else if (ch === '-' || /\s/.test(ch)) {
      out += '-';
    }
  }
  out = out.replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180);
  return out || 'post';
}

// Appends -2, -3… until the (slug, locale) pair is free.
export async function uniqueSlug(base: string, locale: string, exists: (slug: string, locale: string) => Promise<boolean>): Promise<string> {
  let candidate = base || 'post';
  let n = 2;
  while (await exists(candidate, locale)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}
