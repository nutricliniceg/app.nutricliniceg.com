import { NextRequest, NextResponse } from 'next/server';
import { blogService } from '@/lib/blog/blog.service';
import { rssXml } from '@/lib/blog/seo';

export async function GET(request: NextRequest) {
  const locale = new URL(request.url).searchParams.get('locale') === 'en' ? 'en' : 'ar';
  const { posts } = await blogService.list(locale, 1);
  const xml = rssXml(
    posts.map((p) => ({
      slug: p.slug, locale: p.locale, title: p.title, excerpt: p.excerpt,
      published_at: p.published_at,
    })),
    locale
  );
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
