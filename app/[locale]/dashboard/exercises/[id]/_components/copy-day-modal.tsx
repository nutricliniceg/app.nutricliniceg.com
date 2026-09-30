'use client';

import { useState } from 'react';
import { Button, InlineNotification, Modal, Select, SelectItem, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';

import { readApi } from '@/lib/api/fetch-json';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export default function CopyDayModal({ planId, open, onClose }: { planId: string; open: boolean; onClose: (done: boolean) => void }) {
  const t = useTranslations('exercises');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('4');
  const [weeks, setWeeks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await readApi(await fetch(`/api/exercise-plans/${planId}/copy-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_day: Number(from),
          to_days: [Number(to)].filter((d) => d !== Number(from)),
          to_week_numbers: weeks.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 1),
        }),
      }));
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('copyFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} modalHeading={t('copyTitle')} primaryButtonText={t('copy')} secondaryButtonText={t('close')} onRequestSubmit={() => void copy()} onRequestClose={() => onClose(false)}>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Select id="copy-from" labelText={t('fromDay')} value={from} onChange={(e) => setFrom(e.target.value)}>
        {DAYS.map((d) => (
          <SelectItem key={d} value={String(d)} text={`${t('dayLabel')} ${d}`} />
        ))}
      </Select>
      <Select id="copy-to" labelText={t('toDay')} value={to} onChange={(e) => setTo(e.target.value)}>
        {DAYS.map((d) => (
          <SelectItem key={d} value={String(d)} text={`${t('dayLabel')} ${d}`} />
        ))}
      </Select>
      <TextInput id="copy-weeks" labelText={t('toWeeks')} placeholder="2,3" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
      {busy && <p>{t('loading')}</p>}
    </Modal>
  );
}
