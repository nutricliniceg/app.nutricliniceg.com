import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface AdminPostRow {
  id: string;
  locale: string;
  slug: string;
  title: string;
  status: string;
  category_id: string | null;
  translation_of: string | null;
  has_translation: number;
  published_at: Date | null;
  newsletter_sent_at: Date | null;
  updated_at: Date;
  created_at: Date;
}

export interface BlogRevisionRow {
  id: string;
  post_id: string;
  revision_no: number;
  title: string;
  content_md: string;
  changed_by: string | null;
  created_at: Date;
}

export const blogAdminRepository = {
  async slugExists(slug: string, locale: string, exceptId?: string): Promise<boolean> {
    const rows = exceptId
      ? await executeQuery<{ id: string }[]>('SELECT id FROM BlogPost WHERE slug = ? AND locale = ? AND id <> ?', [slug, locale, exceptId])
      : await executeQuery<{ id: string }[]>('SELECT id FROM BlogPost WHERE slug = ? AND locale = ?', [slug, locale]);
    return rows.length > 0;
  },

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const rows = await executeQuery<Record<string, unknown>[]>('SELECT * FROM BlogPost WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  },

  async list(filters: { status?: string; untranslated?: boolean; q?: string; page?: number; limit?: number }): Promise<{ posts: AdminPostRow[]; total: number; untranslatedCount: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filters.status) {
      where.push('p.status = ?');
      params.push(filters.status);
    }
    if (filters.q) {
      where.push('(p.title LIKE ? OR p.slug LIKE ?)');
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (filters.untranslated) {
      where.push(`p.locale = 'ar' AND NOT EXISTS (SELECT 1 FROM BlogPost t WHERE t.translation_of = p.id)`);
    }
    const clause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const posts = await executeQuery<AdminPostRow[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT p.id, p.locale, p.slug, p.title, p.status, p.category_id, p.translation_of,
        EXISTS (SELECT 1 FROM BlogPost t WHERE t.translation_of = p.id) AS has_translation,
        p.published_at, p.newsletter_sent_at, p.updated_at, p.created_at FROM BlogPost p ${clause} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRows = await executeQuery<{ count: number }[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT COUNT(*) as count FROM BlogPost p ${clause}`,
      params
    );
    const untranslatedRows = await executeQuery<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM BlogPost p WHERE p.locale = 'ar' AND NOT EXISTS (SELECT 1 FROM BlogPost t WHERE t.translation_of = p.id)"
    );
    return { posts, total: totalRows[0].count, untranslatedCount: untranslatedRows[0].count };
  },

  async insert(data: Record<string, unknown>): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      `INSERT INTO BlogPost (id, author_id, locale, translation_of, slug, title, excerpt, content_md, content_html,
        featured_image, category_id, status, meta_title, meta_desc, og_image, canonical_url, noindex,
        guest_author, reading_minutes, send_newsletter, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.author_id ?? null, data.locale, data.translation_of ?? null, data.slug, data.title,
        data.excerpt ?? null, data.content_md, data.content_html ?? null, data.featured_image ?? null,
        data.category_id ?? null, data.status ?? 'draft', data.meta_title ?? null, data.meta_desc ?? null,
        data.og_image ?? null, data.canonical_url ?? null, data.noindex ?? false, data.guest_author ?? null,
        data.reading_minutes ?? 1, data.send_newsletter ?? true, data.published_at ?? null]
    );
    return id;
  },

  async update(id: string, data: Record<string, unknown>): Promise<void> {
    const map: Record<string, string> = {
      title: 'title', slug: 'slug', excerpt: 'excerpt', content_md: 'content_md', content_html: 'content_html',
      featured_image: 'featured_image', category_id: 'category_id', status: 'status', meta_title: 'meta_title',
      meta_desc: 'meta_desc', og_image: 'og_image', canonical_url: 'canonical_url', noindex: 'noindex',
      guest_author: 'guest_author', reading_minutes: 'reading_minutes', send_newsletter: 'send_newsletter',
      published_at: 'published_at', translation_of: 'translation_of',
      // Written by postsService.autoNewsletter to lock first-publish-only
      // campaign creation (P28). Without it here the UPDATE silently no-ops
      // (fields stays empty) and a post could re-trigger a campaign on every
      // subsequent publish.
      newsletter_sent_at: 'newsletter_sent_at',
    };
    const fields: string[] = [];
    const values: Array<string | number | boolean | null | Date> = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && map[key]) {
        fields.push(`${map[key]} = ?`);
        values.push(value as string | number | boolean | null | Date);
      }
    }
    if (fields.length === 0) return;
    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- SET columns come from a fixed map; values use ? placeholders (D-01)
    await executeQuery(`UPDATE BlogPost SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async remove(id: string): Promise<void> {
    await executeQuery('DELETE FROM BlogPost WHERE id = ?', [id]);
  },

  async setTags(postId: string, tagIds: string[]): Promise<void> {
    await executeQuery('DELETE FROM BlogPostTag WHERE post_id = ?', [postId]);
    if (tagIds.length === 0) return;
    // PF-02: single multi-row INSERT (was one INSERT per tag).
    await executeQuery(
      // eslint-disable-next-line no-restricted-syntax -- placeholders are bound per row; values use ? (D-01)
      `INSERT INTO BlogPostTag (post_id, tag_id) VALUES ${tagIds.map(() => '(?, ?)').join(',')}`,
      tagIds.flatMap((tagId) => [postId, tagId])
    );
  },

  async tagIds(postId: string): Promise<string[]> {
    const rows = await executeQuery<Array<{ tag_id: string }>>('SELECT tag_id FROM BlogPostTag WHERE post_id = ?', [postId]);
    return rows.map((r) => r.tag_id);
  },

  async nextRevisionNo(postId: string): Promise<number> {
    const rows = await executeQuery<{ max_no: number | null }[]>(
      'SELECT MAX(revision_no) as max_no FROM BlogRevision WHERE post_id = ?',
      [postId]
    );
    return Number(rows[0].max_no ?? 0) + 1;
  },

  async insertRevision(postId: string, title: string, contentMd: string, changedBy: string | null): Promise<void> {
    const no = await blogAdminRepository.nextRevisionNo(postId);
    await executeQuery(
      'INSERT INTO BlogRevision (id, post_id, revision_no, title, content_md, changed_by) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), postId, no, title, contentMd, changedBy]
    );
    // Keep the last 20 snapshots (BLG-11).
    await executeQuery(
      'DELETE FROM BlogRevision WHERE post_id = ? AND revision_no <= ?',
      [postId, no - 20]
    );
  },

  async listRevisions(postId: string): Promise<BlogRevisionRow[]> {
    return executeQuery<BlogRevisionRow[]>(
      'SELECT * FROM BlogRevision WHERE post_id = ? ORDER BY revision_no DESC LIMIT 20',
      [postId]
    );
  },

  async getRevision(postId: string, revisionNo: number): Promise<BlogRevisionRow | null> {
    const rows = await executeQuery<BlogRevisionRow[]>(
      'SELECT * FROM BlogRevision WHERE post_id = ? AND revision_no = ?',
      [postId, revisionNo]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  // CRON-10 hook: due scheduled posts (P29 registers the endpoint).
  async dueScheduled(now = new Date()): Promise<Array<{ id: string }>> {
    return executeQuery<Array<{ id: string }>>(
      "SELECT id FROM BlogPost WHERE status = 'scheduled' AND published_at IS NOT NULL AND published_at <= ?",
      [now]
    );
  },
};
