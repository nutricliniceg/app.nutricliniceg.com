import { NextRequest, NextResponse } from 'next/server';
import { blogService } from '@/lib/blog/blog.service';
import { markdownExport, extractToc } from '@/lib/blog/seo';
import { baseUrl } from '@/lib/blog/seo';

// BLG-32/33: content negotiation for AI agents. Markdown + front-matter
// when asked; anything else redirects to the canonical Arabic article.
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const accept = request.headers.get('accept') ?? '';
  const post = await blogService.getBySlug('ar', slug);
  if (!post) {
    const en = await blogService.getBySlug('en', slug);
    if (!en) return new NextResponse('Not found', { status: 404 });
    if (!accept.includes('text/markdown')) {
      return NextResponse.redirect(`${baseUrl()}/en/blog/${slug}`, 308);
    }
    return markdownResponse(en);
  }
  if (!accept.includes('text/markdown')) {
    return NextResponse.redirect(`${baseUrl()}/ar/blog/${slug}`, 308);
  }
  return markdownResponse(post);
}

async function markdownResponse(post: NonNullable<Awaited<ReturnType<typeof blogService.getBySlug>>>) {
  const tags: string[] = (() => {
    try {
      return (JSON.parse(post.tags ?? '[]') as Array<string | null>).filter((t): t is string => !!t);
    } catch {
      return [];
    }
  })();
  const toc = extractToc(post.content_md);
  const md = markdownExport({
    title: post.title,
    date: post.published_at ? new Date(post.published_at).toISOString() : null,
    author: null,
    tags,
    toc,
    markdown: post.content_md,
  });
  return new NextResponse(md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
