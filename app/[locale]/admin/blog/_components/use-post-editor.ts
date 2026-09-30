'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';
import type { SeoState } from './seo-panel';

export interface LoadedPost {
  title: string; slug: string; excerpt: string | null; content_md: string;
  featured_image: string | null; category_id: string | null; tag_ids: string[];
  status: string; meta_title: string | null; meta_desc: string | null;
  og_image: string | null; canonical_url: string | null; noindex: boolean | number;
  guest_author: string | null; send_newsletter: boolean | number; newsletter_sent_at: string | null;
  updated_at: string;
}

// Editor state machine: load → edit → autosave/backup → save.
export function usePostEditor(postId: string) {
  const t = useTranslations('blogAdmin');
  const [loaded, setLoaded] = useState<LoadedPost | null>(null);
  const [title, setTitle] = useState('');
  const [md, setMd] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<Array<{ id: string; name_ar: string }>>([]);
  const [seo, setSeo] = useState<SeoState>({ slug: '', metaTitle: '', metaDesc: '', ogImage: '', canonical: '', noindex: false, featuredImage: '' });
  const [guest, setGuest] = useState('');
  const [newsletter, setNewsletter] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const d = await readApi<{ post: LoadedPost }>(await fetch(`/api/admin/blog/posts/${postId}`));
    const p = d.post;
    setLoaded(p);
    setTitle(p.title);
    setMd(p.content_md);
    setExcerpt(p.excerpt ?? '');
    setCategory(p.category_id ?? '');
    setSeo({
      slug: p.slug, metaTitle: p.meta_title ?? '', metaDesc: p.meta_desc ?? '',
      ogImage: p.og_image ?? '', canonical: p.canonical_url ?? '',
      noindex: p.noindex === true || p.noindex === 1, featuredImage: p.featured_image ?? '',
    });
    setGuest(p.guest_author ?? '');
    setNewsletter(p.send_newsletter === true || p.send_newsletter === 1);
    setDirty(false);
    const cats = await readApi<{ categories: Array<{ id: string; name_ar: string }> }>(await fetch('/api/admin/blog/taxonomy?kind=categories'));
    setCategories(cats.categories);
    try {
      const raw = window.localStorage.getItem(`blog-draft-${postId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { md: string; at: string };
        if (new Date(parsed.at).getTime() > new Date(p.updated_at).getTime()) setBackup(parsed.md);
      }
    } catch {
      // No usable backup.
    }
  }, [postId]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : t('loadFailed')));
  }, [load, t]);

  const save = useCallback(async (): Promise<void> => {
    setSaveState(t('saving'));
    try {
      await readApi(await fetch(`/api/admin/blog/posts/${postId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), slug: seo.slug.trim() || null, excerpt: excerpt.trim() || null,
          content_md: md, featured_image: seo.featuredImage || null, category_id: category || null,
          meta_title: seo.metaTitle || null, meta_desc: seo.metaDesc || null,
          og_image: seo.ogImage || null, canonical_url: seo.canonical || null,
          noindex: seo.noindex, guest_author: guest.trim() || null, send_newsletter: newsletter,
        }),
      }));
      setDirty(false);
      setSaveState(t('savedAt', { at: new Date().toLocaleTimeString() }));
      window.localStorage.removeItem(`blog-draft-${postId}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
      setSaveState('');
    }
  }, [postId, title, seo, excerpt, md, category, guest, newsletter, load, t]);

  // Autosave every 30s when dirty + local backup (BLG-04).
  useEffect(() => {
    if (!dirty) return;
    const timer = setInterval(() => void save(), 30000);
    return () => clearInterval(timer);
  }, [dirty, save]);

  useEffect(() => {
    if (!dirty) return;
    try {
      window.localStorage.setItem(`blog-draft-${postId}`, JSON.stringify({ md, at: new Date().toISOString() }));
    } catch {
      // Storage full/blocked — server autosave still covers us.
    }
  }, [md, dirty, postId]);

  async function uploadImage(file: File): Promise<string | null> {
    const alt = window.prompt(t('altPrompt'));
    if (!alt) return null;
    const form = new FormData();
    form.append('file', file);
    form.append('alt_text', alt);
    const d = await readApi<{ url: string }>(await fetch('/api/admin/blog/media', { method: 'POST', body: form }));
    return d.url;
  }

  return {
    t, loaded, title, setTitle, md, setMd, excerpt, setExcerpt, category, setCategory,
    categories, seo, setSeo, guest, setGuest, newsletter, setNewsletter,
    dirty, setDirty, saveState, error, backup, setBackup,
    load, save, uploadImage,
  };
}
