import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Tag } from '@carbon/react';
import { blogService } from '@/lib/blog/blog.service';
import NewsletterCta from './_components/newsletter-cta';
import SiteHeader from '../_components/site-header';

// P32-DESIGN §4 — blog index as a card grid (cover placeholder + reading time).
// Zero-DB-404 preserved: the list call is wrapped so an empty database renders
// the empty-state message rather than throwing.
export default async function BlogIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const loc = locale === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale: loc, namespace: 'blog' });
  const th = await getTranslations({ locale: loc, namespace: 'home' });
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const search = query.page ? `page=${page}` : '';

  let posts: Array<{
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    reading_minutes: number;
    category_slug: string | null;
    featured_image: string | null;
  }> = [];
  let total = 0;
  let pages = 0;
  try {
    const res = await blogService.list(loc as 'ar' | 'en', page);
    posts = res.posts as typeof posts;
    total = res.total;
    pages = res.pages;
  } catch {
    posts = [];
  }

  const base = `/${loc}/blog`;
  return (
    <div className="nc-container">
      <SiteHeader locale={loc} pathname={`/${loc}/blog`} search={search} />
      <h1 className="nc-section__title">{t('indexTitle')}</h1>
      <p className="nc-section__subtitle">{t('postCount', { n: total })}</p>

      <div className="nc-postgrid">
        {posts.map((p) => (
          <article className="nc-post" key={p.id}>
            <div className="nc-post__cover">
              {p.featured_image ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote blog cover, not in next/image remotePatterns
                <img
                  src={p.featured_image}
                  alt={p.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span>{p.title}</span>
              )}
            </div>
            <div className="nc-post__body">
              <div className="nc-post__meta">
                {p.category_slug && <Tag type="teal">{p.category_slug}</Tag>}
                <span style={{ color: 'var(--cds-text-secondary)', fontSize: '0.85rem' }}>
                  {th('blogReadingTime', { minutes: p.reading_minutes })}
                </span>
              </div>
              <h2 className="nc-post__title">
                <Link href={`${base}/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  {p.title}
                </Link>
              </h2>
              {p.excerpt && <p className="nc-post__excerpt">{p.excerpt}</p>}
              <Link className="nc-post__more" href={`${base}/${p.slug}`}>
                {th('blogReadMore')} →
              </Link>
            </div>
          </article>
        ))}
      </div>

      {(page > 1 || page < pages) && (
        <nav className="nc-pagination">
          {page > 1 && (
            <Link rel="prev" href={`${base}?page=${page - 1}`}>
              {t('prev')}
            </Link>
          )}
          {page < pages && (
            <Link rel="next" href={`${base}?page=${page + 1}`}>
              {t('next')}
            </Link>
          )}
        </nav>
      )}
      <NewsletterCta />
    </div>
  );
}