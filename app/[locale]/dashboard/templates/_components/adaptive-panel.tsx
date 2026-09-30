'use client';

import { useState } from 'react';
import { Button, InlineNotification, Select, SelectItem, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';

import { readApi } from '@/lib/api/fetch-json';

export default function AdaptivePanel() {
  const t = useTranslations('templates');
  const [patientId, setPatientId] = useState('');
  const [patients, setPatients] = useState<Array<{ id: string; name_ar: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      const d = await readApi<{ patients: Array<{ id: string; name_ar: string }> }>(await fetch('/api/patients?limit=100'));
      setPatients(d.patients);
    } catch {
      setPatients([]);
    }
  }

  async function suggest(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await readApi<{ planId: string }>(await fetch('/api/templates/adaptive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId }),
      }));
      setNotice(t('adaptiveDone', { id: data.planId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('adaptiveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tile>
      <h3>{t('adaptiveTitle')}</h3>
      {notice && <InlineNotification kind="success" title={notice} lowContrast />}
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Button kind="ghost" size="sm" onClick={load}>
        {t('loadPatients')}
      </Button>
      <Select id="adaptive-patient" labelText={t('selectPatient')} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
        <SelectItem value="" text={t('selectPatient')} />
        {patients.map((p) => (
          <SelectItem key={p.id} value={p.id} text={p.name_ar} />
        ))}
      </Select>
      <Button onClick={suggest} disabled={busy || patientId === ''}>
        {t('suggestAdaptive')}
      </Button>
    </Tile>
  );
}
