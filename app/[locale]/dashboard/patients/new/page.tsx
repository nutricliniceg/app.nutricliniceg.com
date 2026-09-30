'use client';

import { useTranslations, useLocale } from 'next-intl';
import {
  Button,
  Checkbox,
  InlineLoading,
  InlineNotification,
  NumberInput,
  Select,
  SelectItem,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CHRONIC_CONDITIONS = ['diabetes', 'kidney', 'liver', 'pregnancy', 'lactation'] as const;

const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;

const GOALS = ['lose', 'maintain', 'gain'] as const;

export default function NewPatientPage() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const router = useRouter();

  const [formData, setFormData] = useState({
    name_ar: '',
    name_en: '',
    gender: 'female' as 'male' | 'female',
    birth_date: '',
    height_cm: '',
    initial_weight_kg: '',
    activity_level: 'moderate',
    goal: 'maintain',
    medical_notes: '',
    chronic_conditions: [] as string[],
    allergies: '',
    consent_ai_sharing: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdPatientId, setCreatedPatientId] = useState('');

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};
    if (!formData.name_ar.trim()) newErrors.name_ar = t('nameArRequired');
    if (!formData.birth_date) newErrors.birth_date = t('birthDateRequired');
    if (!formData.height_cm || Number(formData.height_cm) <= 0) newErrors.height_cm = t('heightRequired');
    if (!formData.initial_weight_kg || Number(formData.initial_weight_kg) <= 0) {
      newErrors.initial_weight_kg = t('weightRequired');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_ar: formData.name_ar.trim(),
          name_en: formData.name_en.trim() || null,
          gender: formData.gender,
          birth_date: formData.birth_date,
          height_cm: Number(formData.height_cm),
          initial_weight_kg: Number(formData.initial_weight_kg),
          activity_level: formData.activity_level,
          goal: formData.goal,
          medical_notes: formData.medical_notes.trim() || null,
          chronic_conditions: formData.chronic_conditions.length > 0 ? formData.chronic_conditions : null,
          allergies: formData.allergies.trim() ? formData.allergies.split(',').map((a) => a.trim()) : null,
          consent_ai_sharing: formData.consent_ai_sharing,
        }),
      });
      const data = (await response.json()) as {
        success: boolean;
        data?: { patientId?: string };
        error?: { message?: string; details?: Record<string, string[]> };
      };
      if (data.success && data.data?.patientId) {
        setCreatedPatientId(data.data.patientId);
      } else {
        setSubmitError(data.error?.message ?? t('createFailed'));
        if (data.error?.details) {
          const fieldErrors: Record<string, string> = {};
          for (const [field, messages] of Object.entries(data.error.details)) {
            fieldErrors[field] = messages[0];
          }
          setErrors(fieldErrors);
        }
      }
    } catch {
      setSubmitError(t('createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  function set(field: string, value: string | boolean): void {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function toggleCondition(condition: string, checked: boolean): void {
    setFormData((prev) => ({
      ...prev,
      chronic_conditions: checked
        ? [...prev.chronic_conditions, condition]
        : prev.chronic_conditions.filter((c) => c !== condition),
    }));
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0 }}>{t('newPatient')}</h1>
        <Button kind="ghost" onClick={() => router.push(`/${locale}/dashboard/patients`)}>
          {t('cancel')}
        </Button>
      </div>

      {submitError && (
        <InlineNotification kind="error" title={t('error')} subtitle={submitError} lowContrast onCloseButtonClick={() => setSubmitError('')} />
      )}

      {createdPatientId && (
        <Tile style={{ marginBottom: 16 }}>
          <h3>{t('success')}</h3>
          <p>{t('patientCreatedSuccess')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="primary" size="sm" onClick={() => router.push(`/${locale}/dashboard/patients/${createdPatientId}`)}>
              {t('viewPatient')}
            </Button>
            <Button kind="secondary" size="sm" onClick={() => window.location.reload()}>
              {t('createAnother')}
            </Button>
          </div>
        </Tile>
      )}

      {formData.chronic_conditions.includes('kidney') && (
        <InlineNotification kind="warning" title={t('kidneyWarningTitle')} subtitle={t('kidneyWarningDesc')} lowContrast />
      )}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <Tile style={{ marginBottom: 16 }}>
          <h3>{t('personalInfo')}</h3>
          <TextInput
            id="np-name-ar"
            labelText={`${t('nameAr')} *`}
            value={formData.name_ar}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name_ar', e.target.value)}
            placeholder={t('nameArPlaceholder')}
            invalid={!!errors.name_ar}
            invalidText={errors.name_ar}
          />
          <TextInput
            id="np-name-en"
            labelText={t('nameEn')}
            value={formData.name_en}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name_en', e.target.value)}
            placeholder={t('nameEnPlaceholder')}
          />
          <Select
            id="np-gender"
            labelText={`${t('gender')} *`}
            value={formData.gender}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set('gender', e.target.value)}
          >
            <SelectItem value="female" text={t('female')} />
            <SelectItem value="male" text={t('male')} />
          </Select>
          <TextInput
            id="np-birth"
            type="date"
            labelText={`${t('birthDate')} *`}
            value={formData.birth_date}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('birth_date', e.target.value)}
            invalid={!!errors.birth_date}
            invalidText={errors.birth_date}
          />
          <NumberInput
            id="np-height"
            label={`${t('heightCm')} *`}
            min={50}
            max={300}
            step={1}
            value={formData.height_cm === '' ? 0 : Number(formData.height_cm)}
            onChange={(_e: unknown, state: { value: number | string }) => set('height_cm', String(state.value))}
            invalid={!!errors.height_cm}
            invalidText={errors.height_cm}
          />
          <NumberInput
            id="np-weight"
            label={`${t('initialWeightKg')} *`}
            min={1}
            max={500}
            step={0.1}
            value={formData.initial_weight_kg === '' ? 0 : Number(formData.initial_weight_kg)}
            onChange={(_e: unknown, state: { value: number | string }) => set('initial_weight_kg', String(state.value))}
            invalid={!!errors.initial_weight_kg}
            invalidText={errors.initial_weight_kg}
          />
        </Tile>

        <Tile style={{ marginBottom: 16 }}>
          <h3>{t('lifestyleGoals')}</h3>
          <Select
            id="np-activity"
            labelText={t('activityLevel')}
            helperText={t('activityLevelHelp')}
            value={formData.activity_level}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set('activity_level', e.target.value)}
          >
            {ACTIVITY_LEVELS.map((level) => (
              <SelectItem key={level} value={level} text={t(level)} />
            ))}
          </Select>
          <Select
            id="np-goal"
            labelText={t('goal')}
            helperText={t('goalHelp')}
            value={formData.goal}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set('goal', e.target.value)}
          >
            {GOALS.map((g) => (
              <SelectItem key={g} value={g} text={t(g)} />
            ))}
          </Select>
        </Tile>

        <Tile style={{ marginBottom: 16 }}>
          <h3>{t('medicalInfo')}</h3>
          <TextArea
            id="np-notes"
            labelText={t('medicalNotes')}
            value={formData.medical_notes}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('medical_notes', e.target.value)}
            placeholder={t('medicalNotesPlaceholder')}
            rows={4}
          />
          <p>{t('chronicConditions')}</p>
          <p style={{ color: '#525252', fontSize: 12 }}>{t('chronicConditionsHelp')}</p>
          {CHRONIC_CONDITIONS.map((condition) => (
            <Checkbox
              key={condition}
              id={`np-cond-${condition}`}
              labelText={t(condition)}
              checked={formData.chronic_conditions.includes(condition)}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => toggleCondition(condition, e.target.checked)}
            />
          ))}
          <TextInput
            id="np-allergies"
            labelText={t('allergies')}
            helperText={t('allergiesHelp')}
            value={formData.allergies}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('allergies', e.target.value)}
            placeholder={t('allergiesPlaceholder')}
          />
        </Tile>

        <Tile style={{ marginBottom: 16 }}>
          <h3>{t('aiConsent')}</h3>
          <Checkbox
            id="np-consent"
            labelText={t('aiConsentLabel')}
            checked={formData.consent_ai_sharing}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('consent_ai_sharing', e.target.checked)}
          />
          <p style={{ color: '#525252', fontSize: 12 }}>{t('aiConsentHelp')}</p>
        </Tile>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Button kind="secondary" type="button" onClick={() => router.push(`/${locale}/dashboard/patients`)}>
            {t('cancel')}
          </Button>
          <Button kind="primary" type="submit" disabled={submitting}>
            {submitting ? <InlineLoading description={t('saving')} /> : t('createPatient')}
          </Button>
        </div>
      </form>
    </div>
  );
}
