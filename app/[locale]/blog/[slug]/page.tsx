import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { blogService } from '@/lib/blog/blog.service';
import { canonicalFor, hreflangAlternates, articleJsonLd, breadcrumbJsonLd, extractToc } from '@/lib/blog/seo';
import { sanitizeBlogHtml, readingMinutes, injectHeadingIds } from '@/lib/blog/render';
import NewsletterCta from '../_components/newsletter-cta';
import SiteHeader from '../../_components/site-header';

function tagsOf(post: { tags: string | null }): string[] {
  if (!post.tags) return [];
  try {
    return (JSON.parse(post.tags) as Array<string | null>).filter((t): t is string => !!t);
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const loc = locale === 'en' ? 'en' : 'ar';
  const post = await blogService.getBySlug(loc, slug);
  if (!post) return {};
  const translations = await blogService.translations(post);
  const alternates = hreflangAlternates(translations.map((p) => ({ slug: p.slug, locale: p.locale })));
  const languages: Record<string, string> = {};
  for (const a of alternates) languages[a.hreflang] = a.href;
  const title = (post.meta_title || post.title).slice(0, 60);
  const description = (post.meta_desc || post.excerpt || '').slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: post.canonical_url || canonicalFor(loc, post.slug), languages },
    robots: post.noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title, description, url: canonicalFor(loc, post.slug), type: 'article',
      images: post.og_image || post.featured_image ? [post.og_image || (post.featured_image as string)] : [],
    },
  };
}

export default async function BlogPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  const sp = (await searchParams) ?? {};
  const search = new URLSearchParams(
    Object.entries(sp).map(([k, v]) => [k, String(v)] as [string, string])
  ).toString();
  const loc = locale === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale: loc, namespace: 'blog' });
  const post = await blogService.getBySlug(loc, slug);
  if (!post) notFound();
  const translations = await blogService.translations(post);
  const related = await blogService.related(post);
  const tags = tagsOf(post);
  const toc = extractToc(post.content_md);
  const html = injectHeadingIds(sanitizeBlogHtml(post.content_html || ''), toc.map((e) => e.anchor));
  const minutes = readingMinutes(post.content_md, post.reading_minutes);
  const articleLd = articleJsonLd({
    title: post.title, description: post.meta_desc || post.excerpt, slug: post.slug, locale: loc,
    image: post.og_image || post.featured_image,
    publishedAt: post.published_at ? new Date(post.published_at).toISOString() : null,
    updatedAt: new Date(post.updated_at).toISOString(),
  });
  const crumbLd = breadcrumbJsonLd(loc, post.slug, post.title);

    return (
    <article className="nc-container">
      <SiteHeader locale={loc} pathname={`/${loc}/blog/${slug}`} search={search} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }} />

      <header className="nc-articleheader">
        <h1 className="nc-section__title">{post.title}</h1>
        <p style={{ color: 'var(--cds-text-secondary)' }}>
          {`${t('readingTime', { n: minutes })} — ${t('views', { n: Number(post.view_count) + 1 })}`}
        </p>
      </header>

      {toc.length > 0 && (
        <nav aria-label={t('toc')} className="nc-card" style={{ marginBlockEnd: '2rem' }}>
          <ul style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
            {toc.map((e) => (
              <li key={e.anchor}>
                <a href={`#${e.anchor}`}>{e.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* P32-DESIGN §4 — `.nc-article` supplies IBM Plex typography, the
          heading hierarchy, table styling and RTL-first spacing for the
          sanitised Markdown HTML. */}
      <div className="nc-article" dangerouslySetInnerHTML={{ __html: html }} />

      {related.length > 0 && (
        <section style={{ marginBlockStart: '3rem' }}>
          <h2 className="nc-section__title">{t('related')}</h2>
          <div className="nc-postgrid">
            {related.map((r) => (
              <article className="nc-card" key={r.id}>
                <h3 className="nc-post__title">
                  <Link href={`/${loc}/blog/${r.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    {r.title}
                  </Link>
                </h3>
              </article>
            ))}
          </div>
        </section>
      )}
      <NewsletterCta />
    </article>
  );
}
