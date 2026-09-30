import { notFound } from 'next/navigation';
import { verifyPreviewToken } from '@/lib/blog-admin/preview';
import { blogAdminRepository } from '@/lib/db/repositories/blog-admin.repo';
import { sanitizeBlogHtml, readingMinutes, injectHeadingIds } from '@/lib/blog/render';
import { extractToc } from '@/lib/blog/seo';

// BLG-10 signed preview without login. Drafts/scheduled render with a
// noindex marker and never increment view counts.
export default async function BlogPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const query = await searchParams;
  const postId = query.preview ? verifyPreviewToken(query.preview) : null;
  if (!postId) notFound();
  const post = (await blogAdminRepository.findById(postId)) as {
    title: string; content_md: string; content_html: string | null; status: string;
  } | null;
  if (!post) notFound();
  const toc = extractToc(post.content_md);
  const html = injectHeadingIds(sanitizeBlogHtml(post.content_html || ''), toc.map((e) => e.anchor));
  const minutes = readingMinutes(post.content_md, null);
  return (
    <article dir="rtl">
      <meta name="robots" content="noindex,nofollow" />
      <p>PREVIEW — {post.status} — {minutes} min</p>
      <h1>{post.title}</h1>
      <nav aria-label="contents">
        <ul>
          {toc.map((e) => (
            <li key={e.anchor}>
              <a href={`#${e.anchor}`}>{e.text}</a>
            </li>
          ))}
        </ul>
      </nav>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
