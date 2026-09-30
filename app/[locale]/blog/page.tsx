import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { blogService } from '@/lib/blog/blog.service';
import NewsletterCta from './_components/newsletter-cta';

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
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const { posts, total, pages } = await blogService.list(loc, page);
  const base = `/${loc}/blog`;
  return (
    <div>
      <h1>{t('indexTitle')}</h1>
      <p>{t('postCount', { n: total })}</p>
      {posts.map((p) => (
        <article key={p.id}>
          <h2>
            <Link href={`${base}/${p.slug}`}>{p.title}</Link>
          </h2>
          {p.excerpt && <p>{p.excerpt}</p>}
        </article>
      ))}
      <nav>
        {page > 1 && <Link rel="prev" href={`${base}?page=${page - 1}`}>{t('prev')}</Link>}
        {page < pages && <Link rel="next" href={`${base}?page=${page + 1}`}>{t('next')}</Link>}
      </nav>
      <NewsletterCta />
    </div>
  );
}
