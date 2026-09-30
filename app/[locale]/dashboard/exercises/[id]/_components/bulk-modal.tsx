'use client';

import { useState } from 'react';
import { Button, InlineNotification, Modal, Select, SelectItem, TextInput, NumberInput } from '@carbon/react';
import { useTranslations } from 'next-intl';

interface Position {
  planId: string;
  day: number;
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
}

interface BulkResult {
  preview?: boolean;
  count: number;
  positions?: Position[];
  undoRevisionNo?: number;
}

import { readApi } from '@/lib/api/fetch-json';

export default function BulkModal({ planId, open, onClose }: { planId: string; open: boolean; onClose: () => void }) {
  const t = useTranslations('exercises');
  const [scope, setScope] = useState('week');
  const [name, setName] = useState('');
  const [op, setOp] = useState('set_sets');
  const [value, setValue] = useState(3);
  const [excluded, setExcluded] = useState('');
  const [preview, setPreview] = useState<BulkResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<number | null>(null);

  async function run(isPreview: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const opBody = op === 'set_sets' ? { type: 'set_sets', sets: value } : op === 'set_reps' ? { type: 'set_reps', reps: value } : { type: 'set_rest', rest_seconds: value };
      const data = await readApi<BulkResult>(await fetch(`/api/exercise-plans/${planId}/bulk-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope, anchor: { exercise_name: name.trim() }, op: opBody,
          exclusions: excluded.split(',').map((s) => s.trim()).filter(Boolean), preview: isPreview,
        }),
      }));
      setPreview(data);
      if (!isPreview && typeof data.undoRevisionNo === 'number') setUndo(data.undoRevisionNo);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('bulkFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} modalHeading={t('bulkTitle')} passiveModal onRequestClose={onClose}>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Select id="bulk-scope" labelText={t('scope')} value={scope} onChange={(e) => setScope(e.target.value)}>
        <SelectItem value="day" text={t('scopeDay')} />
        <SelectItem value="week" text={t('scopeWeek')} />
        <SelectItem value="all-weeks" text={t('scopeAllWeeks')} />
      </Select>
      <TextInput id="bulk-name" labelText={t('exerciseName')} value={name} onChange={(e) => setName(e.target.value)} />
      <Select id="bulk-op" labelText={t('operation')} value={op} onChange={(e) => setOp(e.target.value)}>
        <SelectItem value="set_sets" text={t('opSets')} />
        <SelectItem value="set_reps" text={t('opReps')} />
        <SelectItem value="set_rest" text={t('opRest')} />
      </Select>
      <NumberInput id="bulk-value" label={t('newValue')} value={value} min={0} max={900} onChange={(_, { value: v }) => setValue(Number(v))} />
      <TextInput id="bulk-excl" labelText={t('exclusions')} value={excluded} onChange={(e) => setExcluded(e.target.value)} />
      <Button kind="secondary" size="sm" onClick={() => void run(true)} disabled={busy || name.trim() === ''}>{t('preview')}</Button>
      <Button size="sm" onClick={() => void run(false)} disabled={busy || name.trim() === ''}>{t('apply')}</Button>
      {preview && <p>{t('affectedCount', { n: preview.count })}</p>}
      {preview?.positions?.map((p) => (
        <p key={p.exerciseId}>{`${p.name} — ${t('dayLabel')} ${p.day} (${p.sets}×${p.reps})`}</p>
      ))}
      {undo != null && <p>{t('undoRevision', { n: undo })}</p>}
    </Modal>
  );
}
