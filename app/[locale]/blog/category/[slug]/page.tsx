import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { blogService } from '@/lib/blog/blog.service';
import BlogCardGrid, { type BlogCardPost } from '../../_components/blog-card-grid';
import NewsletterCta from '../../_components/newsletter-cta';
import PublicShell from '../../../_components/public-shell';

// P32-DESIGN-2 — category listing now renders the same card grid and shared
// shell as the blog index, instead of a bare <article><h2> list with no header,
// no locale switcher and no typography.
//
// Zero-DB-404 preserved: an unknown slug or an empty database renders the
// heading plus an empty grid (HTTP 200); it never calls notFound().
export default async function BlogCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, slug } = await params;
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
    const res = await blogService.list(loc as 'ar' | 'en', page, slug);
    posts = res.posts as BlogCardPost[];
    total = res.total;
    pages = res.pages;
  } catch {
    posts = [];
  }

  const base = `/${loc}/blog`;
  return (
    <PublicShell locale={loc} pathname={`${base}/category/${slug}`} search={search}>
      <h1 className="nc-section__title">{`${t('category')}: ${slug}`}</h1>
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
            <Link rel="prev" href={`${base}/category/${slug}?page=${page - 1}`}>
              {t('prev')}
            </Link>
          )}
          {page < pages && (
            <Link rel="next" href={`${base}/category/${slug}?page=${page + 1}`}>
              {t('next')}
            </Link>
          )}
        </nav>
      )}
      <NewsletterCta />
    </PublicShell>
  );
}