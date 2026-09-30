import { NextResponse } from 'next/server';
import { blogService } from '@/lib/blog/blog.service';
import { sitemapXml, hreflangAlternates } from '@/lib/blog/seo';

// DB-backed at request time: never prerender at build (no DB then).
export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await blogService.sitemapPosts();
  const alternates = new Map<string, Array<{ hreflang: string; href: string }>>();
  // Group by translation family so alternates attach only when BOTH exist.
  const byFamily = new Map<string, typeof rows>();
  for (const r of rows) {
    const family = r.translation_of ?? r.id;
    const list = byFamily.get(family) ?? [];
    list.push(r);
    byFamily.set(family, list);
  }
  for (const [, family] of byFamily) {
    const alts = hreflangAlternates(family.map((p) => ({ slug: p.slug, locale: p.locale })));
    if (alts.length === 0) continue;
    for (const p of family) alternates.set(`${p.locale}:${p.slug}`, alts);
  }
  const xml = sitemapXml(
    rows.map((r) => ({ slug: r.slug, locale: r.locale, updated_at: r.updated_at })),
    alternates
  );
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
