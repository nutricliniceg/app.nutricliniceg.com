'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, InlineNotification, Modal, Select, SelectItem, Tag } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface PatientOption {
  id: string;
  name_ar: string;
}

export default function PatientBar({ conversationId, patient, onChange }: {
  conversationId: string | null;
  patient: { id: string; name_ar: string } | null;
  onChange: () => void;
}) {
  const t = useTranslations('assistant');
  const [open, setOpen] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [picked, setPicked] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/patients?limit=100')
      .then((r) => readApi<{ patients: PatientOption[] }>(r))
      .then((d) => setPatients(d.patients))
      .catch(() => setPatients([]));
  }, [open ]);

  async function link(): Promise<void> {
    if (!conversationId || !picked) return;
    setError(null);
    try {
      await readApi(await fetch(`/api/ai-assistant/conversations/${conversationId}/patient`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: picked, confirmed }),
      }));
      setOpen(false);
      setConfirmed(false);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('linkFailed'));
    }
  }

  async function unlink(): Promise<void> {
    if (!conversationId) return;
    await readApi(await fetch(`/api/ai-assistant/conversations/${conversationId}/patient`, { method: 'DELETE' }));
    onChange();
  }

  async function consent(): Promise<void> {
    if (!patient) return;
    setError(null);
    try {
      await readApi(await fetch('/api/ai-assistant/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patient.id }),
      }));
      setNotice(t('consentSaved'));
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('consentFailed'));
    }
  }

  return (
    <div>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {notice && <InlineNotification kind="success" title={notice} lowContrast />}
      {patient ? (
        <p>
          <Tag type="blue">{`👤 ${t('patient')}: ${patient.name_ar}`}</Tag>
          <Button kind="ghost" size="sm" onClick={() => void unlink()}>{t('unlink')}</Button>
          <Button kind="ghost" size="sm" onClick={() => void consent()}>{t('captureConsent')}</Button>
        </p>
      ) : (
        <Button kind="ghost" size="sm" onClick={() => setOpen(true)} disabled={!conversationId}>{t('linkPatient')}</Button>
      )}
      <Modal open={open} modalHeading={t('linkPatient')} primaryButtonText={t('link')} secondaryButtonText={t('close')} onRequestSubmit={() => void link()} onRequestClose={() => setOpen(false)}>
        <Select id="ab-patient" labelText={t('selectPatient')} value={picked} onChange={(e) => setPicked(e.target.value)}>
          <SelectItem value="" text={t('selectPatient')} />
          {patients.map((p) => (
            <SelectItem key={p.id} value={p.id} text={p.name_ar} />
          ))}
        </Select>
        <Checkbox id="ab-confirm" labelText={t('confirmSwitch')} checked={confirmed} onChange={(_, { checked }) => setConfirmed(Boolean(checked))} />
        <p>{t('switchWarning')}</p>
      </Modal>
    </div>
  );
}
