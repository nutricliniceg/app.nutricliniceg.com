// Pure SEO helpers (BLG-24/25/27/28/30/32/33, §7.12.10, D-26). No I/O.

export interface HreflangPost {
  slug: string;
  locale: string;
}

export function baseUrl(): string {
  return (process.env.APP_URL || 'https://nutricliniceg.com').replace(/\/$/, '');
}

// hreflang alternates ONLY when both translations exist (BLG-48);
// x-default always points at Arabic (BLG-51).
export function hreflangAlternates(posts: HreflangPost[]): Array<{ hreflang: string; href: string }> {
  const base = baseUrl();
  const byLocale = new Map(posts.map((p) => [p.locale, p]));
  const ar = byLocale.get('ar');
  const en = byLocale.get('en');
  if (!ar || !en) return [];
  return [
    { hreflang: 'ar', href: `${base}/ar/blog/${ar.slug}` },
    { hreflang: 'en', href: `${base}/en/blog/${en.slug}` },
    { hreflang: 'x-default', href: `${base}/ar/blog/${ar.slug}` },
  ];
}

// Canonical ALWAYS self-referencing (BLG-49).
export function canonicalFor(locale: string, slug: string): string {
  return `${baseUrl()}/${locale}/blog/${slug}`;
}

export interface JsonLdInput {
  title: string;
  description: string | null;
  slug: string;
  locale: string;
  image: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export function articleJsonLd(input: JsonLdInput): Record<string, unknown> {
  const url = canonicalFor(input.locale, input.slug);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description ?? undefined,
    image: input.image ?? undefined,
    datePublished: input.publishedAt ?? undefined,
    dateModified: input.updatedAt,
    mainEntityOfPage: url,
    inLanguage: input.locale,
  };
}

export function breadcrumbJsonLd(locale: string, slug: string, title: string): Record<string, unknown> {
  const base = baseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Blog', item: `${base}/${locale}/blog` },
      { '@type': 'ListItem', position: 2, name: title, item: canonicalFor(locale, slug) },
    ],
  };
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface RssPost {
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  published_at: Date | string | null;
}

export function rssXml(posts: RssPost[], locale: string): string {
  const base = baseUrl();
  const items = posts
    .map((p) => `    <item><title>${escapeXml(p.title)}</title><link>${base}/${locale}/blog/${p.slug}</link><guid>${base}/${locale}/blog/${p.slug}</guid><description>${escapeXml(p.excerpt ?? '')}</description><pubDate>${p.published_at ? new Date(p.published_at).toUTCString() : ''}</pubDate></item>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>NutriClinicEG Blog</title><link>${base}/${locale}/blog</link><description>Nutrition clinic articles</description>\n${items}\n</channel></rss>`;
}

export interface SitemapPost {
  slug: string;
  locale: string;
  updated_at: Date | string;
}

export function sitemapXml(posts: SitemapPost[], alternates: Map<string, Array<{ hreflang: string; href: string }>>): string {
  const urls = posts
    .map((p) => {
      const loc = canonicalFor(p.locale, p.slug);
      const alts = (alternates.get(`${p.locale}:${p.slug}`) ?? [])
        .map((a) => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escapeXml(a.href)}"/>`)
        .join('');
      const lastmod = new Date(p.updated_at).toISOString().slice(0, 10);
      return `  <url><loc>${escapeXml(loc)}</loc><lastmod>${lastmod}</lastmod>${alts}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>`;
}

export interface TocEntry {
  level: number;
  text: string;
  anchor: string;
}

// Auto table-of-contents from Markdown headings (BLG-34).
export function extractToc(markdown: string): TocEntry[] {
  const out: TocEntry[] = [];
  const used = new Set<string>();
  for (const line of markdown.split('\n')) {
    const match = line.match(/^(#{2,4})\s+(.+)$/);
    if (!match) continue;
    const text = match[2].trim().replace(/[#*_`]+/g, '').trim();
    if (!text) continue;
    let anchor = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    if (!anchor) anchor = 'section';
    let unique = anchor;
    let n = 2;
    while (used.has(unique)) {
      unique = `${anchor}-${n}`;
      n += 1;
    }
    used.add(unique);
    out.push({ level: match[1].length, text, anchor: unique });
  }
  return out;
}

export interface MarkdownExportInput {
  title: string;
  date: string | null;
  author: string | null;
  tags: string[];
  toc: TocEntry[];
  markdown: string;
}

// Markdown export with front-matter + TOC (BLG-32/33).
export function markdownExport(input: MarkdownExportInput): string {
  const front = ['---', `title: ${JSON.stringify(input.title)}`, `date: ${input.date ?? ''}`, `author: ${JSON.stringify(input.author ?? '')}`, `tags: [${input.tags.map((t) => JSON.stringify(t)).join(', ')}]`, '---', ''].join('\n');
  const toc = input.toc.length > 0
    ? ['## Table of contents', '', ...input.toc.map((e) => `${'  '.repeat(e.level - 2)}- [${e.text}](#${e.anchor})`), ''].join('\n')
    : '';
  return `${front}${toc}${input.markdown}\n`;
}
