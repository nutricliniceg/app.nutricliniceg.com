'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  ProgressIndicator,
  ProgressStep,
  Select,
  SelectItem,
  TextInput,
  Checkbox,
  Tile,
  Tag,
  InlineNotification,
} from '@carbon/react';
import { Checkmark } from '@carbon/icons-react';
import { useTranslations } from 'next-intl';
import PlanResult, { type DraftResult } from './_components/plan-result';

interface PatientOption {
  id: string;
  name_ar: string;
  name_en: string | null;
  gender: 'male' | 'female';
}

import { readApi } from '@/lib/api/fetch-json';

const STEPS = ['stepPatient', 'stepTargets', 'stepPrefs', 'stepMode', 'stepReview', 'stepDraft', 'stepApprove'] as const;

export default function NewPlanPage() {
  const t = useTranslations('plans');
  const [step, setStep] = useState(0);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientId, setPatientId] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('female');
  const [targets, setTargets] = useState({ calories: '', protein: '', carbs: '', fats: '' });
  const [cuisine, setCuisine] = useState('general');
  const [mealsPerDay, setMealsPerDay] = useState('4');
  const [dislikes, setDislikes] = useState('');
  const [includeOwn, setIncludeOwn] = useState(false);
  const [mode, setMode] = useState<'from_list' | 'ai_free'>('from_list');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState(false);

  useEffect(() => {
    fetch('/api/patients?limit=100')
      .then((r) => readApi<{ patients: PatientOption[] }>(r))
      .then((d) => setPatients(d.patients))
      .catch(() => setPatients([]));
  }, []);

  async function pickPatient(id: string): Promise<void> {
    setPatientId(id);
    const found = patients.find((p) => p.id === id);
    if (found) setGender(found.gender);
    if (!id) return;
    try {
      const data = await readApi<{ nutrition: { targetCalories: number; targetProteinG: number; targetCarbsG: number; targetFatsG: number } }>(
        await fetch(`/api/patients/${id}`)
      );
      setTargets({
        calories: String(data.nutrition.targetCalories),
        protein: String(data.nutrition.targetProteinG),
        carbs: String(data.nutrition.targetCarbsG),
        fats: String(data.nutrition.targetFatsG),
      });
    } catch {
      // Prefill is best-effort; the doctor can type targets manually.
    }
  }

  const floor = gender === 'female' ? 1200 : 1500;
  const belowFloor = targets.calories !== '' && Number(targets.calories) < floor;
  const canGenerate = patientId !== '' && targets.calories !== '' && (mode === 'from_list' || confirmed);

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const data = await readApi<DraftResult>(
        await fetch('/api/plans/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_id: patientId,
            mode,
            target_calories: Number(targets.calories),
            target_protein_g: targets.protein === '' ? null : Number(targets.protein),
            target_carbs_g: targets.carbs === '' ? null : Number(targets.carbs),
            target_fats_g: targets.fats === '' ? null : Number(targets.fats),
            preferences: { cuisine, dislikes: dislikes || null, mealsPerDay: Number(mealsPerDay) },
            include_own_foods: includeOwn,
            ai_free_confirmed: mode === 'ai_free' ? confirmed : undefined,
          }),
        })
      );
      setResult(data);
      setConverted(false);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function convert(): Promise<void> {
    if (!result) return;
    setConverting(true);
    try {
      await readApi(await fetch(`/api/plans/${result.planId}/convert-to-verified`, { method: 'POST' }));
      setConverted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    } finally {
      setConverting(false);
    }
  }

  const set = (key: keyof typeof targets) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setTargets((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1>{t('title')}</h1>
        <p style={{ opacity: 0.75 }}>{t('subtitle')}</p>
      </div>
      <ProgressIndicator currentIndex={step}>
        {STEPS.map((s) => (
          <ProgressStep key={s} label={t(s)} />
        ))}
      </ProgressIndicator>
      {error && <InlineNotification kind="error" title={error} hideCloseButton lowContrast />}

      {step === 0 && (
        <Tile>
          <Select id="plan-patient" labelText={t('selectPatient')} value={patientId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => pickPatient(e.target.value)}>
            <SelectItem value="" text={t('selectPatient')} />
            {patients.map((p) => (
              <SelectItem key={p.id} value={p.id} text={`${p.name_ar}${p.name_en ? ` / ${p.name_en}` : ''}`} />
            ))}
          </Select>
        </Tile>
      )}

      {step === 1 && (
        <Tile>
          <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
            <TextInput id="plan-kcal" labelText={t('targetCalories')} value={targets.calories} onChange={set('calories')} inputMode="numeric" />
            <TextInput id="plan-protein" labelText={t('targetProtein')} value={targets.protein} onChange={set('protein')} inputMode="decimal" />
            <TextInput id="plan-carbs" labelText={t('targetCarbs')} value={targets.carbs} onChange={set('carbs')} inputMode="decimal" />
            <TextInput id="plan-fats" labelText={t('targetFats')} value={targets.fats} onChange={set('fats')} inputMode="decimal" />
            {belowFloor && <InlineNotification kind="warning" title={t('railsNote')} hideCloseButton lowContrast />}
          </div>
        </Tile>
      )}

      {step === 2 && (
        <Tile>
          <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
            <Select id="plan-cuisine" labelText={t('cuisine')} value={cuisine} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCuisine(e.target.value)}>
              <SelectItem value="middle-eastern" text={t('cuisineMiddleEastern')} />
              <SelectItem value="mediterranean" text={t('cuisineMediterranean')} />
              <SelectItem value="general" text={t('cuisineGeneral')} />
            </Select>
            <Select id="plan-mpd" labelText={t('mealsPerDay')} value={mealsPerDay} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMealsPerDay(e.target.value)}>
              <SelectItem value="3" text="3" />
              <SelectItem value="4" text="4" />
              <SelectItem value="5" text="5" />
            </Select>
            <TextInput id="plan-dislikes" labelText={t('dislikes')} value={dislikes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDislikes(e.target.value)} />
            <Checkbox id="plan-own" labelText={t('includeOwnFoods')} checked={includeOwn} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeOwn(e.target.checked)} />
          </div>
        </Tile>
      )}

      {step === 3 && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Tile>
            <Tag type="green">{t('modeFromList')}</Tag>
            <p style={{ opacity: 0.75 }}>{t('modeFromListDesc')}</p>
            <Button kind={mode === 'from_list' ? 'primary' : 'tertiary'} size="sm" renderIcon={Checkmark} onClick={() => setMode('from_list')}>
              {t('modeFromList')}
            </Button>
          </Tile>
          <Tile>
            <Tag type="red">{t('modeAiFree')}</Tag>
            <p style={{ opacity: 0.75 }}>{t('modeAiFreeDesc')}</p>
            <Button kind={mode === 'ai_free' ? 'primary' : 'tertiary'} size="sm" renderIcon={Checkmark} onClick={() => setMode('ai_free')}>
              {t('modeAiFree')}
            </Button>
            {mode === 'ai_free' && (
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <InlineNotification kind="warning" title={t('aiFreeWarning')} hideCloseButton lowContrast />
                <Checkbox id="plan-confirm" labelText={t('aiFreeConfirm')} checked={confirmed} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmed(e.target.checked)} />
              </div>
            )}
          </Tile>
        </div>
      )}

      {step === 4 && (
        <Tile>
          <p style={{ opacity: 0.75 }}>
            {targets.calories} kcal · {mode === 'from_list' ? t('modeFromList') : t('modeAiFree')}
          </p>
          <Button kind="primary" size="md" renderIcon={Checkmark} disabled={busy || !canGenerate} onClick={generate}>
            {busy ? t('generating') : t('generate')}
          </Button>
        </Tile>
      )}

      {step === 5 && result && (
        <PlanResult result={result} onConvert={convert} converting={converting} converted={converted} />
      )}

      {step === 6 && (
        <Tile>
          <p style={{ opacity: 0.75 }}>{t('approveHandoff')}</p>
        </Tile>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {step > 0 && step < 5 && (
          <Button kind="secondary" size="sm" onClick={() => setStep((s) => s - 1)}>
            {t('back')}
          </Button>
        )}
        {step < 4 && (
          <Button kind="primary" size="sm" disabled={step === 0 && patientId === ''} onClick={() => setStep((s) => s + 1)}>
            {t('next')}
          </Button>
        )}
        {step === 5 && (
          <Button kind="secondary" size="sm" onClick={() => setStep(6)}>
            {t('next')}
          </Button>
        )}
      </div>
    </div>
  );
}
