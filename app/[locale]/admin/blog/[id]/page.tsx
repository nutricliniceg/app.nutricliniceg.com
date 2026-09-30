'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { Button, InlineNotification } from '@carbon/react';
import PostFields from '../_components/post-fields';
import SeoPanel from '../_components/seo-panel';
import LifecycleBar from '../_components/lifecycle-bar';
import RevisionsPanel from '../_components/revisions-panel';
import MediaPicker from '../_components/media-picker';
import { usePostEditor } from '../_components/use-post-editor';

const TiptapEditor = dynamic(() => import('../_components/tiptap-editor'), { ssr: false });

export default function BlogEditorPage() {
  const params = useParams();
  const postId = String(params.id);
  const [picker, setPicker] = useState<null | 'featured' | 'og'>(null);
  const e = usePostEditor(postId);
  const { t, loaded, error, backup, setMd, setBackup, setDirty, saveState, dirty } = e;

  if (!loaded) return <p>{t('loading')}</p>;
  return (
    <div>
      <h1>{t('editorTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {backup && (
        <>
          <InlineNotification kind="warning" title={t('backupFound')} lowContrast />
          <Button size="sm" onClick={() => { setMd(backup); setBackup(null); setDirty(true); }}>{t('restoreBackup')}</Button>
        </>
      )}
      <p>{saveState || (dirty ? t('unsaved') : t('clean'))}</p>
      <PostFields
        title={e.title} setTitle={e.setTitle} excerpt={e.excerpt} setExcerpt={e.setExcerpt}
        category={e.category} setCategory={e.setCategory} categories={e.categories}
        guest={e.guest} setGuest={e.setGuest} md={e.md} setMd={e.setMd}
        onDirty={() => setDirty(true)}
      />
      <TiptapEditor
        valueMd={e.md}
        onMdChange={(next) => { e.setMd(next); setDirty(true); }}
        onSave={() => void e.save()}
        onUploadImage={e.uploadImage}
      />
      <SeoPanel
        value={e.seo}
        onChange={(patch) => { e.setSeo((s) => ({ ...s, ...patch })); setDirty(true); }}
        onPickImage={(target) => setPicker(target)}
      />
      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onPick={(url) => {
          if (picker === 'og') e.setSeo((s) => ({ ...s, ogImage: url }));
          else e.setSeo((s) => ({ ...s, featuredImage: url }));
          setDirty(true);
        }}
      />
      <Button onClick={() => void e.save()}>{t('save')}</Button>
      <LifecycleBar
        postId={postId} status={loaded.status} newsletter={e.newsletter}
        newsletterSentAt={loaded.newsletter_sent_at} onNewsletterChange={(v) => { e.setNewsletter(v); setDirty(true); }}
        onChanged={() => void e.load()}
      />
      <RevisionsPanel postId={postId} />
    </div>
  );
}
