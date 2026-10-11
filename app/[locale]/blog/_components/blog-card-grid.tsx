import Link from 'next/link';
import { Tag } from '@carbon/react';

/**
 * P32-DESIGN-2 — the blog card grid, extracted from the blog index so the
 * category and tag listings render the exact same cards instead of a bare
 * <article><h2> list. One component, one visual language, three routes.
 *
 * Zero-DB-404 preserved: callers pass an already-resolved (possibly empty)
 * array; an empty result renders the empty grid and the caller's empty-state
 * message rather than throwing.
 */
export type BlogCardPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  reading_minutes: number;
  category_slug: string | null;
  featured_image: string | null;
};

export default function BlogCardGrid({
  posts,
  base,
  readMore,
  formatReadingTime,
}: {
  posts: BlogCardPost[];
  /** Public base path, e.g. '/ar/blog'. */
  base: string;
  /** Translated "Read article" label. */
  readMore: string;
  /** Translated reading-time formatter, e.g. t('blogReadingTime', { minutes }). */
  formatReadingTime: (minutes: number) => string;
}) {
  return (
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
                {formatReadingTime(p.reading_minutes)}
              </span>
            </div>
            <h2 className="nc-post__title">
              <Link href={`${base}/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                {p.title}
              </Link>
            </h2>
            {p.excerpt && <p className="nc-post__excerpt">{p.excerpt}</p>}
            <Link className="nc-post__more" href={`${base}/${p.slug}`}>
              {readMore} →
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}