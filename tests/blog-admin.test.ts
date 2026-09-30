import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/db/repositories/blog-admin.repo', () => ({
  blogAdminRepository: {
    slugExists: vi.fn().mockResolvedValue(false),
    findById: vi.fn(),
    list: vi.fn(),
    insert: vi.fn().mockResolvedValue('post-1'),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    setTags: vi.fn().mockResolvedValue(undefined),
    tagIds: vi.fn().mockResolvedValue([]),
    nextRevisionNo: vi.fn().mockResolvedValue(1),
    insertRevision: vi.fn().mockResolvedValue(undefined),
    listRevisions: vi.fn().mockResolvedValue([]),
    getRevision: vi.fn(),
    dueScheduled: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/db/repositories/taxonomy.repo', () => ({
  taxonomyRepository: { listCategories: vi.fn(), insertCategory: vi.fn(), deleteCategory: vi.fn(), listTags: vi.fn(), insertTag: vi.fn(), deleteTag: vi.fn() },
}));

import { blogAdminRepository } from '@/lib/db/repositories/blog-admin.repo';
import { postsService } from '@/lib/blog-admin/posts.service';
import { mdToHtml, htmlToMd, cleanPastedHtml } from '@/lib/blog-admin/markdown';
import { slugifyTitle, uniqueSlug } from '@/lib/blog-admin/slug';
import { buildVariants } from '@/lib/blog-admin/media.service';
import { mediaService } from '@/lib/blog-admin/media.service';
import sharp from 'sharp';

type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => { vi.clearAllMocks(); });

describe('P26 markdown round-trips (D-21)', () => {
  it('md → html → md preserves structure', () => {
    const md = '## Title\n\nSome **bold** and *italic* text.\n\n- item one\n- item two';
    const html = mdToHtml(md);
    expect(html).toContain('<h2');
    expect(html).toContain('<strong>');
    expect(html).toContain('<li>');
    const back = htmlToMd(html);
    expect(back).toContain('## Title');
    expect(back).toContain('**bold**');
    expect(back).toContain('item one');
  });
});

describe('P26 paste sanitizer (BLG-06)', () => {
  it('cleans Word junk, keeps structure', () => {
    const dirty = '<p class="MsoNormal" style="mso-margin:0"><o:p></o:p>Hello <font color="red">World</font></p><!-- comment -->';
    const clean = cleanPastedHtml(dirty);
    expect(clean).not.toContain('MsoNormal');
    expect(clean).not.toContain('o:p');
    expect(clean).not.toContain('<font');
    expect(clean).not.toContain('<!--');
    expect(clean).toContain('Hello');
    expect(clean).toContain('World');
  });
});

describe('P26 slugs per locale', () => {
  it('transliterates Arabic and uniquifies', async () => {
    expect(slugifyTitle('أفضل وصفات الرجيم')).toBe('afdl-wsfat-alrjym');
    expect(slugifyTitle('Hello World!')).toBe('hello-world');
    (blogAdminRepository.slugExists as Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await uniqueSlug('hello', 'ar', (s, l) => (blogAdminRepository.slugExists as Mock)(s, l))).toBe('hello-2');
  });
});

describe('P26 scheduling stays draft until time', () => {
  it('future publish → scheduled; due hook flips only due rows', async () => {
    (blogAdminRepository.findById as Mock).mockResolvedValue({ id: 'p1', title: 'T', content_md: 'x' });
    const future = await postsService.publish('a1', 'p1', new Date(Date.now() + 86400000).toISOString());
    expect(future.status).toBe('scheduled');
    expect(blogAdminRepository.update as Mock).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'scheduled' }));
    (blogAdminRepository.dueScheduled as Mock).mockResolvedValue([{ id: 'p2' }]);
    const flipped = await postsService.publishDue(new Date());
    expect(flipped.published).toBe(1);
    expect(blogAdminRepository.update as Mock).toHaveBeenCalledWith('p2', { status: 'published' });
  });
});

describe('P26 revisions restore', () => {
  it('restores title+content and appends a revision', async () => {
    (blogAdminRepository.findById as Mock).mockResolvedValue({ id: 'p1' });
    (blogAdminRepository.getRevision as Mock).mockResolvedValue({ revision_no: 3, title: 'Old', content_md: '## Old' });
    await postsService.restore('a1', 'p1', 3);
    expect(blogAdminRepository.update as Mock).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'Old', content_md: '## Old' }));
    expect(blogAdminRepository.insertRevision as Mock).toHaveBeenCalled();
  });
});

describe('P26 media variants (BLG-21, real sharp pipeline)', () => {
  it('generates thumb/medium/large WebP files', async () => {
    const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 0, g: 128, b: 128 } } }).png().toBuffer();
    const { files, width, height } = await buildVariants(new Uint8Array(png));
    expect(width).toBe(1200);
    expect(height).toBe(900);
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const dir = process.env.STORAGE_DIR ? `${process.env.STORAGE_DIR}/media` : `${process.cwd()}/.data/media`;
    for (const f of [files.thumb, files.medium, files.large]) {
      const stat = await fs.stat(path.join(dir, f));
      expect(stat.size).toBeGreaterThan(0);
      expect(f.endsWith('.webp')).toBe(true);
      await fs.unlink(path.join(dir, f));
    }
    await fs.unlink(path.join(dir, files.original));
  }, 30000);

  it('rejects uploads without alt text before touching storage', async () => {
    await expect(mediaService.upload('a1', 'x.png', 'image/png', new Uint8Array([1, 2, 3]), { altText: '' })).rejects.toMatchObject({ code: 'ALT_REQUIRED' });
  });
});

describe('P26 translation clone + newsletter lock', () => {
  it('clones Arabic as the English starting draft, linked', async () => {
    (blogAdminRepository.findById as Mock).mockResolvedValue({ id: 'ar1', locale: 'ar', slug: 'hello', title: 'مرحبا', excerpt: null, content_md: '## Hi', featured_image: null, category_id: null });
    const out = await postsService.translate('a1', 'ar1');
    expect(out.id).toBe('post-1');
    expect(blogAdminRepository.insert as Mock).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en', translation_of: 'ar1', content_md: '## Hi' }));
  });

  it('locks newsletter re-enable after send', async () => {
    (blogAdminRepository.findById as Mock).mockResolvedValue({ id: 'p1', title: 'T', content_md: 'x', newsletter_sent_at: new Date() });
    await expect(postsService.update('a1', 'p1', { send_newsletter: true })).rejects.toMatchObject({ code: 'NEWSLETTER_LOCKED' });
  });
});
