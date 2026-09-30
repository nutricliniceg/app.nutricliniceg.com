'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, InlineNotification, Modal, Select, SelectItem } from '@carbon/react';
import { useTranslations } from 'next-intl';
import type { TemplateCardData } from './template-types';

interface PatientOption {
  id: string;
  name_ar: string;
}

interface ApplyResult {
  planId: string;
  removed: Array<{ day: number; meal: string; name: string; allergy: string }>;
  warnings: string[];
  deviationKcal: number;
  largeDiffPct: number;
}

import { readApi } from '@/lib/api/fetch-json';

export default function ApplyModal({ tpl, onClose }: { tpl: TemplateCardData | null; onClose: (planId?: string) => void }) {
  const t = useTranslations('templates');
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    if (!tpl) return;
    setPatientId('');
    setConfirm(false);
    setError(null);
    setResult(null);
    fetch('/api/patients?limit=100')
      .then((r) => readApi<{ patients: PatientOption[] }>(r))
      .then((d) => setPatients(d.patients))
      .catch(() => setPatients([]));
  }, [tpl]);

  async function apply(): Promise<void> {
    if (!tpl) return;
    setBusy(true);
    setError(null);
    try {
      const data = await readApi<ApplyResult>(await fetch(`/api/templates/${tpl.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, confirm_large_diff: confirm }),
      }));
      setResult(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('applyFailed');
      if (msg.includes('differs by')) setError(`${t('largeDiffConfirm')} — ${msg}`);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={tpl !== null} modalHeading={tpl ? `${t('applyTitle')}: ${tpl.name}` : ''} primaryButtonText={t('applyToPatient')} secondaryButtonText={t('close')} onRequestSubmit={apply} onRequestClose={() => onClose(result?.planId)}>
      {error && <InlineNotification kind="warning" title={error} lowContrast />}
      <Select id="apply-patient" labelText={t('selectPatient')} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
        <SelectItem value="" text={t('selectPatient')} />
        {patients.map((p) => (
          <SelectItem key={p.id} value={p.id} text={p.name_ar} />
        ))}
      </Select>
      <Checkbox id="apply-confirm" labelText={t('largeDiffConfirm')} checked={confirm} onChange={(_, { checked }) => setConfirm(Boolean(checked))} />
      <Button kind="secondary" size="sm" onClick={apply} disabled={busy || patientId === ''}>
        {t('applyToPatient')}
      </Button>
      {result && (
        <div>
          <InlineNotification kind="success" title={t('draftCreated', { id: result.planId })} lowContrast />
          <p>{t('removedCount', { n: result.removed.length })}</p>
          {result.removed.map((r, i) => (
            <p key={i}>{`${r.name} (${r.allergy})`}</p>
          ))}
          {result.warnings.map((w, i) => (
            <p key={`w${i}`}>{w}</p>
          ))}
        </div>
      )}
    </Modal>
  );
}
