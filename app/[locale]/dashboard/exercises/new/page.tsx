'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button, InlineNotification, NumberInput, Select, SelectItem, TextInput, Tile } from '@carbon/react';
import { useTranslations, useLocale } from 'next-intl';

import { readApi } from '@/lib/api/fetch-json';

interface PatientOption {
  id: string;
  name_ar: string;
}

interface GenerateResult {
  planId: string;
  exerciseCount: number;
  disclaimer: string;
}

export default function NewExercisePlanPage() {
  const t = useTranslations('exercises');
  const router = useRouter();
  const params = useParams();
  const locale = useLocale() || String(params.locale);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState('');
  const [goal, setGoal] = useState('lose');
  const [level, setLevel] = useState('beginner');
  const [equipment, setEquipment] = useState('');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  useEffect(() => {
    fetch('/api/patients?limit=100')
      .then((r) => readApi<{ patients: PatientOption[] }>(r))
      .then((d) => setPatients(d.patients))
      .catch(() => setPatients([]));
  }, []);

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const data = await readApi<GenerateResult>(await fetch('/api/exercise-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, goal, level, equipment: equipment || null, days_per_week: days }),
      }));
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>{t('generateTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Select id="ex-patient" labelText={t('selectPatient')} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
        <SelectItem value="" text={t('selectPatient')} />
        {patients.map((p) => (
          <SelectItem key={p.id} value={p.id} text={p.name_ar} />
        ))}
      </Select>
      <Select id="ex-goal" labelText={t('goal')} value={goal} onChange={(e) => setGoal(e.target.value)}>
        <SelectItem value="lose" text={t('goalLose')} />
        <SelectItem value="maintain" text={t('goalMaintain')} />
        <SelectItem value="gain" text={t('goalGain')} />
        <SelectItem value="general" text={t('goalGeneral')} />
      </Select>
      <Select id="ex-level" labelText={t('level')} value={level} onChange={(e) => setLevel(e.target.value)}>
        <SelectItem value="beginner" text={t('levelBeginner')} />
        <SelectItem value="intermediate" text={t('levelIntermediate')} />
        <SelectItem value="advanced" text={t('levelAdvanced')} />
      </Select>
      <TextInput id="ex-equip" labelText={t('equipment')} value={equipment} onChange={(e) => setEquipment(e.target.value)} />
      <NumberInput id="ex-days" label={t('daysPerWeek')} value={days} min={1} max={7} onChange={(_, { value }) => setDays(Number(value))} />
      <Button onClick={() => void generate()} disabled={busy || patientId === ''}>{t('generate')}</Button>
      {result && (
        <Tile>
          <InlineNotification kind="info" title={result.disclaimer} lowContrast />
          <p>{t('generatedCount', { n: result.exerciseCount })}</p>
          <Button size="sm" onClick={() => router.push(`/${locale}/dashboard/exercises/${result.planId}`)}>{t('openEditor')}</Button>
        </Tile>
      )}
    </div>
  );
}
