import { unstable_cache as nextCache, revalidateTag } from 'next/cache';
import { blogRepository, type BlogPostRow } from '@/lib/db/repositories/blog.repo';
import { fail } from '@/lib/plans';

// BLG-29: public reads go through tagged caches so publishing invalidates
// via revalidateTag('blog') — no full rebuild, critical on cPanel.
export const BLOG_TAG = 'blog';

async function fetchList(locale: 'ar' | 'en', page: number, categorySlug?: string, tagSlug?: string) {
  return blogRepository.listPublished(locale, { page, limit: 12, categorySlug, tagSlug });
}

const cachedList = nextCache(fetchList, ['blog-list'], { tags: [BLOG_TAG] });

export const blogService = {
  async list(locale: 'ar' | 'en', page: number, categorySlug?: string, tagSlug?: string): Promise<{ posts: BlogPostRow[]; total: number; pages: number }> {
    const { posts, total } = await cachedList(locale, page, categorySlug, tagSlug);
    return { posts, total, pages: Math.max(1, Math.ceil(total / 12)) };
  },

  async getBySlug(locale: string, slug: string): Promise<BlogPostRow | null> {
    const post = await blogRepository.findBySlug(slug, locale);
    if (!post) return null;
    // Fire-and-forget view counting must not delay the render.
    void blogRepository.incrementViews(post.id).catch(() => undefined);
    return post;
  },

  async translations(post: BlogPostRow): Promise<BlogPostRow[]> {
    return blogRepository.findTranslations({ id: post.id, translation_of: post.translation_of });
  },

  async related(post: BlogPostRow): Promise<BlogPostRow[]> {
    return blogRepository.related(post, 3);
  },

  async sitemapPosts() {
    return blogRepository.sitemapRows();
  },

  async llmsPosts() {
    return blogRepository.llmsRows();
  },
};

// Called by the P26 admin publish path (and only there) after any
// create/update/publish/unpublish/archive/delete.
export function revalidateBlog(): void {
  try {
    revalidateTag(BLOG_TAG);
  } catch (err) {
    throw fail('REVALIDATE_FAILED', err instanceof Error ? err.message : 'Revalidation failed');
  }
}
