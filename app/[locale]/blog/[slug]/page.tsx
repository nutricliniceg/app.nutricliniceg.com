import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { blogService } from '@/lib/blog/blog.service';
import { canonicalFor, hreflangAlternates, articleJsonLd, breadcrumbJsonLd, extractToc } from '@/lib/blog/seo';
import { sanitizeBlogHtml, readingMinutes, injectHeadingIds } from '@/lib/blog/render';
import NewsletterCta from '../_components/newsletter-cta';

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
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
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
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbLd) }} />
      <h1>{post.title}</h1>
      <p>{`${t('readingTime', { n: minutes })} · ${t('views', { n: Number(post.view_count) + 1 })}`}</p>
      {toc.length > 0 && (
        <nav aria-label={t('toc')}>
          <ul>
            {toc.map((e) => (
              <li key={e.anchor}>
                <a href={`#${e.anchor}`}>{e.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {related.length > 0 && (
        <section>
          <h2>{t('related')}</h2>
          {related.map((r) => (
            <h3 key={r.id}>
              <Link href={`/${loc}/blog/${r.slug}`}>{r.title}</Link>
            </h3>
          ))}
        </section>
      )}
      <NewsletterCta />
    </article>
  );
}
