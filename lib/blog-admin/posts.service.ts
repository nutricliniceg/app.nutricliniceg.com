import { blogAdminRepository } from '@/lib/db/repositories/blog-admin.repo';
import { taxonomyRepository } from '@/lib/db/repositories/taxonomy.repo';
import { fail } from '@/lib/plans';
import { slugifyTitle, uniqueSlug } from './slug';
import { mdToHtml } from './markdown';
import { sanitizeBlogHtml, readingMinutes } from '@/lib/blog/render';
import { revalidateBlog } from '@/lib/blog/blog.service';
import { campaignsService } from '@/lib/newsletter/campaigns.service';
import type { PostCreateInput, PostUpdateInput } from './post.schema';

// Best-effort newsletter hook: publish flow must never fail because of campaigns.
async function autoNewsletter(fresh: {
  id: string; slug: string; locale: string; title: string; excerpt: string | null;
  featured_image: string | null; newsletter_sent_at: Date | null; send_newsletter: boolean | number | null;
  published_at: Date | null;
}): Promise<void> {
  try {
    if (!fresh.newsletter_sent_at && fresh.send_newsletter) {
      const { ids } = await campaignsService.autoFromPost({ ...fresh, newsletter_sent_at: null });
      if (ids.length > 0) {
        await blogAdminRepository.update(fresh.id, { newsletter_sent_at: new Date() });
      }
    }
  } catch {
    // Silent: newsletter must never break publishing.
  }
}

function renderHtml(markdown: string): string {
  return sanitizeBlogHtml(mdToHtml(markdown));
}

export const postsService = {
  async list(filters: { status?: string; untranslated?: boolean; q?: string; page?: number; limit?: number }) {
    return blogAdminRepository.list(filters);
  },

  async get(id: string) {
    const post = await blogAdminRepository.findById(id);
    if (!post) return null;
    const tags = await blogAdminRepository.tagIds(id);
    return { ...post, tag_ids: tags };
  },

  async create(authorId: string, input: PostCreateInput): Promise<{ id: string }> {
    const slug = await uniqueSlug(
      input.slug?.trim() || slugifyTitle(input.title),
      input.locale,
      (s, l) => blogAdminRepository.slugExists(s, l)
    );
    const html = renderHtml(input.content_md);
    const id = await blogAdminRepository.insert({
      author_id: authorId, locale: input.locale, translation_of: input.translation_of ?? null,
      slug, title: input.title.trim(), excerpt: input.excerpt?.trim() || null,
      content_md: input.content_md, content_html: html,
      featured_image: input.featured_image ?? null, category_id: input.category_id ?? null,
      status: 'draft', meta_title: input.meta_title?.trim() || null, meta_desc: input.meta_desc?.trim() || null,
      og_image: input.og_image ?? null, canonical_url: input.canonical_url ?? null,
      noindex: input.noindex ?? false, guest_author: input.guest_author?.trim() || null,
      reading_minutes: readingMinutes(input.content_md, null),
      send_newsletter: input.send_newsletter ?? true,
      published_at: input.published_at ? new Date(input.published_at) : null,
    });
    await blogAdminRepository.setTags(id, input.tag_ids ?? []);
    await blogAdminRepository.insertRevision(id, input.title.trim(), input.content_md, authorId);
    return { id };
  },

  async update(authorId: string, id: string, input: PostUpdateInput): Promise<void> {
    const existing = await blogAdminRepository.findById(id);
    if (!existing) throw fail('NOT_FOUND', 'Post not found');
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.slug !== undefined && input.slug !== null && input.slug.trim() !== '') {
      const slug = slugifyTitle(input.slug) || slugifyTitle(String(existing.title));
      if (await blogAdminRepository.slugExists(slug, String(existing.locale), id)) {
        throw fail('DUPLICATE_SLUG', 'Slug already exists for this locale');
      }
      patch.slug = slug;
    }
    if (input.excerpt !== undefined) patch.excerpt = input.excerpt?.trim() || null;
    if (input.content_md !== undefined) {
      patch.content_md = input.content_md;
      patch.content_html = renderHtml(input.content_md);
      patch.reading_minutes = readingMinutes(input.content_md, null);
    }
    if (input.featured_image !== undefined) patch.featured_image = input.featured_image;
    if (input.category_id !== undefined) patch.category_id = input.category_id;
    if (input.meta_title !== undefined) patch.meta_title = input.meta_title?.trim() || null;
    if (input.meta_desc !== undefined) patch.meta_desc = input.meta_desc?.trim() || null;
    if (input.og_image !== undefined) patch.og_image = input.og_image;
    if (input.canonical_url !== undefined) patch.canonical_url = input.canonical_url;
    if (input.noindex !== undefined) patch.noindex = input.noindex;
    if (input.guest_author !== undefined) patch.guest_author = input.guest_author?.trim() || null;
    if (input.translation_of !== undefined) patch.translation_of = input.translation_of;
    if (input.published_at !== undefined) patch.published_at = input.published_at ? new Date(input.published_at) : null;
    if (input.send_newsletter !== undefined) {
      // newsletter_sent_at is LOCKED once the campaign engine stamps it (D-29):
      // re-enabling afterwards never re-sends.
      if (existing.newsletter_sent_at && input.send_newsletter === true) {
        throw fail('NEWSLETTER_LOCKED', 'Newsletter already sent for this post');
      }
      patch.send_newsletter = input.send_newsletter;
    }
    await blogAdminRepository.update(id, patch);
    if (input.tag_ids !== undefined) await blogAdminRepository.setTags(id, input.tag_ids);
    const fresh = await blogAdminRepository.findById(id);
    await blogAdminRepository.insertRevision(id, String(fresh?.title ?? ''), String(fresh?.content_md ?? ''), authorId);
    revalidateBlog();
  },

  async remove(id: string): Promise<void> {
    const existing = await blogAdminRepository.findById(id);
    if (!existing) throw fail('NOT_FOUND', 'Post not found');
    await blogAdminRepository.remove(id);
    revalidateBlog();
  },

  async publish(authorId: string, id: string, publishedAt: string | null): Promise<{ status: string }> {
    const existing = await blogAdminRepository.findById(id);
    if (!existing) throw fail('NOT_FOUND', 'Post not found');
    const at = publishedAt ? new Date(publishedAt) : new Date();
    const status = at.getTime() > Date.now() ? 'scheduled' : 'published';
    await blogAdminRepository.update(id, { status, published_at: at });
    const fresh = await blogAdminRepository.findById(id);
    await blogAdminRepository.insertRevision(id, String(fresh?.title ?? ''), String(fresh?.content_md ?? ''), authorId);
    revalidateBlog();
    if (status === 'published' && fresh) await autoNewsletter(fresh as never);
    return { status };
  },

  async setStatus(id: string, status: 'draft' | 'published' | 'archived'): Promise<void> {
    const existing = await blogAdminRepository.findById(id);
    if (!existing) throw fail('NOT_FOUND', 'Post not found');
    await blogAdminRepository.update(id, { status });
    if (status === 'archived' || status === 'draft') {
      try { await campaignsService.cancelForPost(id, `post_${status}`); } catch { /* silent */ }
    }
    revalidateBlog();
  },

  async bulk(ids: string[], op: 'publish' | 'unpublish' | 'archive' | 'delete' | 'change_category', categoryId?: string | null): Promise<{ affected: number }> {
    let affected = 0;
    for (const id of ids) {
      const existing = await blogAdminRepository.findById(id);
      if (!existing) continue;
      if (op === 'delete') {
        await blogAdminRepository.remove(id);
      } else if (op === 'publish') {
        await blogAdminRepository.update(id, { status: 'published', published_at: new Date() });
      } else if (op === 'unpublish') {
        await blogAdminRepository.update(id, { status: 'draft' });
      } else if (op === 'archive') {
        await blogAdminRepository.update(id, { status: 'archived' });
      } else if (op === 'change_category') {
        await blogAdminRepository.update(id, { category_id: categoryId ?? null });
      }
      affected += 1;
    }
    if (affected > 0) revalidateBlog();
    return { affected };
  },

  // BLG-44/45: clone Arabic content as the English starting point, linked
  // via translation_of. No machine translation (BLG-46) — the clone is a
  // verbatim starting draft for the human translator.
  async translate(authorId: string, id: string): Promise<{ id: string }> {
    const source = await blogAdminRepository.findById(id);
    if (!source || source.locale !== 'ar') throw fail('NOT_FOUND', 'Arabic source post not found');
    const slug = await uniqueSlug(`${String(source.slug)}-en`, 'en', (s, l) => blogAdminRepository.slugExists(s, l));
    const created = await postsService.create(authorId, {
      locale: 'en',
      title: String(source.title),
      slug,
      excerpt: (source.excerpt as string | null) ?? null,
      content_md: String(source.content_md),
      featured_image: (source.featured_image as string | null) ?? null,
      category_id: (source.category_id as string | null) ?? null,
      translation_of: String(source.id),
    });
    return created;
  },

  async revisions(id: string) {
    const existing = await blogAdminRepository.findById(id);
    if (!existing) return null;
    return blogAdminRepository.listRevisions(id);
  },

  async restore(authorId: string, id: string, revisionNo: number): Promise<void> {
    const existing = await blogAdminRepository.findById(id);
    if (!existing) throw fail('NOT_FOUND', 'Post not found');
    const rev = await blogAdminRepository.getRevision(id, revisionNo);
    if (!rev) throw fail('NOT_FOUND', 'Revision not found');
    await blogAdminRepository.update(id, {
      title: rev.title, content_md: rev.content_md, content_html: renderHtml(rev.content_md),
      reading_minutes: readingMinutes(rev.content_md, null),
    });
    await blogAdminRepository.insertRevision(id, rev.title, rev.content_md, authorId);
    revalidateBlog();
  },

  // CRON-10 hook: flip due scheduled posts to published (P29 registers it).
  async publishDue(now = new Date()): Promise<{ published: number }> {
    const due = await blogAdminRepository.dueScheduled(now);
    for (const row of due) {
      await blogAdminRepository.update(row.id, { status: 'published' });
      const fresh = await blogAdminRepository.findById(row.id);
      if (fresh) await autoNewsletter(fresh as never);
    }
    if (due.length > 0) revalidateBlog();
    return { published: due.length };
  },

  async categories() {
    return taxonomyRepository.listCategories();
  },

  async tags() {
    return taxonomyRepository.listTags();
  },
};
