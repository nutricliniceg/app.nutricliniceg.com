'use client';

import { useRef, useState } from 'react';
import { Button, Tile, InlineNotification } from '@carbon/react';
import { Download, Upload } from '@carbon/icons-react';
import { useTranslations } from 'next-intl';
import { readApi, type ImportReport } from './types';

export default function ImportPanel({ onImported }: { onImported: () => void }) {
  const t = useTranslations('foodLists');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadTemplate(): Promise<void> {
    const res = await fetch('/api/foods/template');
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'food-import-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport(): Promise<void> {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/foods/import?scope=mine', { method: 'POST', body: form });
      const data = await readApi<ImportReport>(res);
      setReport(data);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tile>
      <h3>{t('importTitle')}</h3>
      <p style={{ opacity: 0.75 }}>{t('importHelp')}</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button kind="tertiary" size="sm" renderIcon={Download} onClick={downloadTemplate}>
          {t('downloadTemplate')}
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx" aria-label={t('selectFile')} />
        <Button kind="primary" size="sm" renderIcon={Upload} disabled={busy} onClick={runImport}>
          {t('import')}
        </Button>
      </div>
      {error && <InlineNotification kind="error" title={error} hideCloseButton lowContrast />}
      {report && (
        <div style={{ marginTop: 12 }}>
          <p>
            {t('importReport')}: {t('imported')} {report.imported}/{report.total} · {t('rejected')} {report.rejected.length} ·{' '}
            {t('skippedDupes')} {report.skipped.length}
          </p>
          {report.rejected.map((r) => (
            <InlineNotification key={`rej-${r.row}`} kind="error" title={`${r.name}: ${r.reason}`} hideCloseButton lowContrast />
          ))}
          {report.skipped.map((r) => (
            <InlineNotification key={`skp-${r.row}`} kind="info" title={`${r.name}: ${r.reason}`} hideCloseButton lowContrast />
          ))}
        </div>
      )}
    </Tile>
  );
}
