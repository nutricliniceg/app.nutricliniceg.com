import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { blogService } from '@/lib/blog/blog.service';
import BlogCardGrid, { type BlogCardPost } from './_components/blog-card-grid';
import NewsletterCta from './_components/newsletter-cta';
import PublicShell from '../_components/public-shell';

// P32-DESIGN §4 — blog index as a card grid (cover placeholder + reading time).
// P32-DESIGN-2 — renders through the shared public shell, and the card markup
// now lives in BlogCardGrid so the category/tag listings match it exactly.
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

  let posts: BlogCardPost[] = [];
  let total = 0;
  let pages = 0;
  try {
    const res = await blogService.list(loc as 'ar' | 'en', page);
    posts = res.posts as BlogCardPost[];
    total = res.total;
    pages = res.pages;
  } catch {
    posts = [];
  }

  const base = `/${loc}/blog`;
  return (
    <PublicShell locale={loc} pathname={base} search={search}>
      <h1 className="nc-section__title">{t('indexTitle')}</h1>
      <p className="nc-section__subtitle">{t('postCount', { n: total })}</p>

      <BlogCardGrid
        posts={posts}
        base={base}
        readMore={th('blogReadMore')}
        formatReadingTime={(m) => th('blogReadingTime', { minutes: m })}
      />

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
    </PublicShell>
  );
}