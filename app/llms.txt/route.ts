import { NextResponse } from 'next/server';
import { blogService } from '@/lib/blog/blog.service';
import { baseUrl } from '@/lib/blog/seo';

// Every published post is appended here (BLG-33, feeds O5) — no rebuild:
// the route reads the live tables on every request.
export async function GET() {
  const base = baseUrl();
  const posts = await blogService.llmsPosts();
  const lines = [
    '# NutriClinicEG',
    'B2B SaaS for nutrition clinics.',
    `Website: ${base}`,
    `API Catalog: ${base}/.well-known/api-catalog`,
    '',
    '## Blog',
  ];
  for (const p of posts) {
    lines.push(`- [${p.title}](${base}/${p.locale}/blog/${p.slug})`);
  }
  return new NextResponse(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
