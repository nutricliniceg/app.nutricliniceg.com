'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button, InlineLoading, InlineNotification, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';

import { readApi } from '@/lib/api/fetch-json';

// UI-13: FileUploader loads on demand, not with the settings bundle.
const LogoUploader = dynamic(() => import('./logo-uploader'), {
  loading: () => <InlineLoading description="" />,
});

interface Branding {
  clinic_name: string | null;
  display: { clinicName: string; logoUrl: string | null; isFallback: boolean };
}

export default function BrandingForm() {
  const t = useTranslations('settings');
  const [name, setName] = useState('');
  const [logoId, setLogoId] = useState<string | null>(null);
  const [current, setCurrent] = useState<Branding | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/branding')
      .then((r) => readApi<Branding>(r))
      .then((d) => {
        setCurrent(d);
        setName(d.clinic_name ?? '');
      })
      .catch(() => {});
  }, []);

  async function onFiles(_event: React.SyntheticEvent<HTMLElement>, content: { addedFiles: File[] }): Promise<void> {
    const file = content.addedFiles?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'other');
      const up = await readApi<{ fileId: string }>(await fetch('/api/files/upload', { method: 'POST', body: form }));
      setLogoId(up.fileId);
      setNotice(t('logoUploaded'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { clinic_name: name.trim() || null };
      if (logoId) body.clinic_logo_file_id = logoId;
      const d = await readApi<Branding>(await fetch('/api/settings/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
      setCurrent(d);
      setLogoId(null);
      setNotice(t('saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tile>
      <h3>{t('brandingTitle')}</h3>
      {notice && <InlineNotification kind="success" title={notice} lowContrast onClose={() => setNotice(null)} />}
      {error && <InlineNotification kind="error" title={error} lowContrast onClose={() => setError(null)} />}
      {current?.display.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- instant preview of the just-uploaded logo; next/image optimization is unnecessary here
        <img src={current.display.logoUrl} alt={current.display.clinicName} style={{ maxHeight: 64 }} />
      )}
      <TextInput id="brand-name" labelText={t('clinicName')} value={name} onChange={(e) => setName(e.target.value)} />
      <LogoUploader labelTitle={t('clinicLogo')} labelDescription={t('logoHint')} buttonLabel={t('upload')} accept={['image/jpeg', 'image/png', 'image/webp']} onAddFiles={(e, c) => void onFiles(e, c)} />
      <Button onClick={() => void save()} disabled={busy}>{t('save')}</Button>
    </Tile>
  );
}
