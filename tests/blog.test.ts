import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/db/repositories/blog.repo', () => ({
  blogRepository: {
    listPublished: vi.fn(),
    findBySlug: vi.fn(),
    findTranslations: vi.fn(),
    related: vi.fn(),
    incrementViews: vi.fn().mockResolvedValue(undefined),
    sitemapRows: vi.fn().mockResolvedValue([]),
    llmsRows: vi.fn().mockResolvedValue([]),
  },
}));

import { revalidateTag } from 'next/cache';
import { blogRepository } from '@/lib/db/repositories/blog.repo';
import { blogService, revalidateBlog } from '@/lib/blog/blog.service';
import { hreflangAlternates, canonicalFor, rssXml, sitemapXml, extractToc, markdownExport } from '@/lib/blog/seo';
import { sanitizeBlogHtml, injectHeadingIds } from '@/lib/blog/render';
import { GET as markdownRoute } from '@/app/blog/[slug]/route';

type Mock = ReturnType<typeof vi.fn>;

const arPost = {
  id: 'ar-1', locale: 'ar', slug: 'hello', title: 'مرحبا', translation_of: null,
  content_md: '## Intro\n\nText here.', content_html: '<h2>Intro</h2><p>Text here.</p>',
  tags: null, meta_title: null, meta_desc: null, excerpt: 'Ex', og_image: null,
  featured_image: null, canonical_url: null, noindex: false, reading_minutes: 2,
  view_count: 5, published_at: new Date('2026-09-01'), updated_at: new Date('2026-09-02'),
};

beforeEach(() => { vi.clearAllMocks(); });

describe('P25 markdown negotiation (BLG-32)', () => {
  it('returns exact markdown with front-matter + TOC for agents', async () => {
    (blogRepository.findBySlug as Mock).mockImplementation(async (slug: string, locale: string) => {
      if (locale === 'ar' && slug === 'hello') return arPost;
      return null;
    });
    const res = await markdownRoute(
      new NextRequest('http://localhost/blog/hello', { headers: { accept: 'text/markdown' } }),
      { params: Promise.resolve({ slug: 'hello' }) }
    );
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const text = await res.text();
    expect(text).toContain('title: "مرحبا"');
    expect(text).toContain('## Table of contents');
    expect(text).toContain('## Intro');
  });

  it('redirects browsers to the canonical article', async () => {
    (blogRepository.findBySlug as Mock).mockResolvedValue(arPost);
    const res = await markdownRoute(
      new NextRequest('http://localhost/blog/hello', { headers: { accept: 'text/html' } }),
      { params: Promise.resolve({ slug: 'hello' }) }
    );
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toContain('/ar/blog/hello');
  });
});

describe('P25 bilingual rules (D-26/BLG-47/48/49/51)', () => {
  it('emits hreflang only when both translations exist', () => {
    expect(hreflangAlternates([{ slug: 'a', locale: 'ar' }, { slug: 'b', locale: 'en' }])).toHaveLength(3);
    expect(hreflangAlternates([{ slug: 'a', locale: 'ar' }])).toEqual([]);
    expect(hreflangAlternates([])).toEqual([]);
  });

  it('x-default always points at Arabic', () => {
    const alts = hreflangAlternates([{ slug: 'a', locale: 'ar' }, { slug: 'b', locale: 'en' }]);
    expect(alts.find((a) => a.hreflang === 'x-default')?.href).toContain('/ar/blog/a');
  });

  it('canonical is always self-referencing', () => {
    expect(canonicalFor('en', 'b')).toContain('/en/blog/b');
  });

  it('/en/blog hides untranslated Arabic posts', async () => {
    (blogRepository.listPublished as Mock).mockImplementation(async (locale: string) => {
      if (locale === 'en') return { posts: [], total: 0 };
      return { posts: [arPost], total: 1 };
    });
    const en = await blogService.list('en', 1);
    const ar = await blogService.list('ar', 1);
    expect(en.posts).toHaveLength(0);
    expect(ar.posts).toHaveLength(1);
    expect(blogRepository.listPublished as Mock).toHaveBeenCalledWith('en', expect.objectContaining({ page: 1, limit: 12 }));
  });
});

describe('P25 RSS validity (BLG-30)', () => {
  it('produces well-formed RSS with items', () => {
    const xml = rssXml([{ slug: 'hello', locale: 'ar', title: 'مرحبا', excerpt: 'Ex', published_at: new Date('2026-09-01') }], 'ar');
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('/ar/blog/hello');
    expect(xml).toContain('<pubDate>');
  });
});

describe('P25 sitemap hreflang (BLG-28)', () => {
  it('attaches alternates only to translated families', () => {
    const xml = sitemapXml(
      [
        { slug: 'a', locale: 'ar', updated_at: new Date('2026-09-02') },
        { slug: 'solo', locale: 'ar', updated_at: new Date('2026-09-02') },
      ],
      new Map([['ar:a', [{ hreflang: 'ar', href: 'https://nutricliniceg.com/ar/blog/a' }, { hreflang: 'en', href: 'https://nutricliniceg.com/en/blog/b' }, { hreflang: 'x-default', href: 'https://nutricliniceg.com/ar/blog/a' }]]])
    );
    expect(xml).toContain('hreflang="en"');
    expect(xml).toContain('/ar/blog/solo');
    expect(xml.split('hreflang').length - 1).toBe(3);
  });
});

describe('P25 revalidateTag on publish (BLG-29)', () => {
  it('invokes revalidateTag(blog)', () => {
    revalidateBlog();
    expect(revalidateTag as Mock).toHaveBeenCalledWith('blog');
  });
});

describe('P25 render hygiene (BLG-34/39/41)', () => {
  it('extracts TOC, injects anchors, strips hostile markup', () => {
    const toc = extractToc('## Intro\n### Deep dive\n# Title ignored\n## Intro');
    expect(toc.map((e) => e.anchor)).toEqual(['intro', 'deep-dive', 'intro-2']);
    const html = injectHeadingIds(sanitizeBlogHtml('<h2>Intro</h2><script>alert(1)</script><p onclick="x()">Hi</p><iframe src="https://evil.com/x"></iframe><img src="a.png">'), toc.map((e) => e.anchor));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('evil.com');
    expect(html).toContain('id="intro"');
    expect(html).toContain('loading="lazy"');
  });

  it('keeps YouTube/Vimeo embeds', () => {
    const html = sanitizeBlogHtml('<iframe src="https://www.youtube.com/embed/abc"></iframe>');
    expect(html).toContain('youtube.com');
  });

  it('exports markdown with TOC for agents', () => {
    const md = markdownExport({ title: 'T', date: '2026-09-01', author: 'A', tags: ['x'], toc: [{ level: 2, text: 'Intro', anchor: 'intro' }], markdown: '## Intro\nHi' });
    expect(md).toContain('Table of contents');
    expect(md).toContain('[Intro](#intro)');
  });
});
