import { executeQuery } from '@/lib/db/pool';

export interface BlogPostRow {
  id: string;
  author_id: string | null;
  locale: string;
  translation_of: string | null;
  slug: string;
  title: string;
  excerpt: string | null;
  content_md: string;
  content_html: string | null;
  featured_image: string | null;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  status: string;
  meta_title: string | null;
  meta_desc: string | null;
  og_image: string | null;
  canonical_url: string | null;
  noindex: boolean | number;
  reading_minutes: number;
  view_count: number;
  published_at: Date | null;
  updated_at: Date;
  tags: string | null;
}

const POST_SELECT = `SELECT p.*, c.slug AS category_slug, c.name_ar AS category_name,
  (SELECT JSON_ARRAYAGG(t.slug) FROM BlogPostTag pt INNER JOIN BlogTag t ON t.id = pt.tag_id WHERE pt.post_id = p.id) AS tags
  FROM BlogPost p LEFT JOIN BlogCategory c ON c.id = p.category_id`;

// Only published, visible posts — the public surface never leaks drafts.
function liveClause(): string {
  return `p.status = 'published' AND (p.published_at IS NULL OR p.published_at <= NOW())`;
}

export const blogRepository = {
  async listPublished(locale: 'ar' | 'en', opts: { page?: number; limit?: number; categorySlug?: string; tagSlug?: string }): Promise<{ posts: BlogPostRow[]; total: number }> {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 12;
    const offset = (page - 1) * limit;
    const where = [liveClause(), 'p.locale = ?'];
    const params: Array<string | number> = [locale];
    if (opts.categorySlug) {
      where.push('c.slug = ?');
      params.push(opts.categorySlug);
    }
    if (opts.tagSlug) {
      where.push(`EXISTS (SELECT 1 FROM BlogPostTag pt INNER JOIN BlogTag t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.slug = ?)`);
      params.push(opts.tagSlug);
    }
    const posts = await executeQuery<BlogPostRow[]>(
      POST_SELECT + ' WHERE ' + where.join(' AND ') + ' ORDER BY p.published_at DESC, p.created_at DESC LIMIT ? OFFSET ?',
      [...params, limit, offset]
    );
    const totalRows = await executeQuery<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM BlogPost p LEFT JOIN BlogCategory c ON c.id = p.category_id WHERE ' + where.join(' AND '),
      params
    );
    return { posts, total: totalRows[0].count };
  },

  async findBySlug(slug: string, locale: string): Promise<BlogPostRow | null> {
    const rows = await executeQuery<BlogPostRow[]>(
      POST_SELECT + ' WHERE p.slug = ? AND p.locale = ? AND ' + liveClause() + ' LIMIT 1',
      [slug, locale]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  // Translation group for hreflang: parent + siblings (both directions).
  async findTranslations(post: { id: string; translation_of: string | null }): Promise<BlogPostRow[]> {
    const parentId = post.translation_of ?? post.id;
    const rows = await executeQuery<BlogPostRow[]>(
      POST_SELECT + ' WHERE (p.id = ? OR p.translation_of = ?) AND ' + liveClause(),
      [parentId, parentId]
    );
    return rows;
  },

  async related(post: BlogPostRow, limit = 3): Promise<BlogPostRow[]> {
    const tagSlugs: string[] = post.tags ? (JSON.parse(post.tags) as Array<string | null>).filter((t): t is string => !!t) : [];
    const rows = await executeQuery<BlogPostRow[]>(
      POST_SELECT + ' WHERE p.id <> ? AND p.locale = ? AND ' + liveClause() +
        ' AND (p.category_id = ? OR EXISTS (SELECT 1 FROM BlogPostTag pt INNER JOIN BlogTag t ON t.id = pt.tag_id WHERE pt.post_id = p.id AND t.slug IN (?)))' +
        ' ORDER BY p.published_at DESC LIMIT ?',
      [post.id, post.locale, post.category_id, tagSlugs.length > 0 ? tagSlugs : ['__none__'], limit]
    );
    return rows;
  },

  async incrementViews(id: string): Promise<void> {
    await executeQuery('UPDATE BlogPost SET view_count = view_count + 1 WHERE id = ?', [id]);
  },

  async sitemapRows(): Promise<Array<{ slug: string; locale: string; updated_at: Date; translation_of: string | null; id: string }>> {
    return executeQuery<Array<{ slug: string; locale: string; updated_at: Date; translation_of: string | null; id: string }>>(
      'SELECT slug, locale, updated_at, translation_of, id FROM BlogPost WHERE ' + liveClause() + ' ORDER BY published_at DESC LIMIT 5000'
    );
  },

  async llmsRows(): Promise<Array<{ slug: string; locale: string; title: string; published_at: Date | null }>> {
    return executeQuery<Array<{ slug: string; locale: string; title: string; published_at: Date | null }>>(
      'SELECT slug, locale, title, published_at FROM BlogPost WHERE ' + liveClause() + ' ORDER BY published_at DESC LIMIT 500'
    );
  },
};
