'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, InlineNotification, Tabs, Tab, TabList, TabPanels, TabPanel, Tag } from '@carbon/react';
import { useTranslations } from 'next-intl';
import ExerciseDay from './_components/exercise-day';
import BulkModal from './_components/bulk-modal';
import CopyDayModal from './_components/copy-day-modal';
import RevisionsPanel from './_components/revisions-panel';
import { newExercise, type EditDay } from './_components/exercise-types';

import { readApi } from '@/lib/api/fetch-json';

interface LoadedDay {
  dayId: string;
  day: number;
  exercises: Array<{ id: string; name_ar: string; name_en: string | null; sets: number; reps: number; rest_seconds: number | null; youtube_url: string | null; notes: string | null }>;
}

export default function ExerciseEditorPage() {
  const t = useTranslations('exercises');
  const params = useParams();
  const planId = String(params.id);
  const [status, setStatus] = useState('');
  const [days, setDays] = useState<EditDay[]>([]);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<{ plan: { status: string }; days: LoadedDay[] }>(await fetch(`/api/exercise-plans/${planId}`));
      setStatus(String(d.plan.status));
      setDays(d.days.map((x) => ({
        day: x.day,
        exercises: x.exercises.map((e) => ({ clientId: e.id, id: e.id, name_ar: e.name_ar, name_en: e.name_en, sets: e.sets, reps: e.reps, rest_seconds: e.rest_seconds, youtube_url: e.youtube_url, notes: e.notes })),
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [planId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await readApi(await fetch(`/api/exercise-plans/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: days.map((d) => ({ day: d.day, exercises: d.exercises.map((e) => ({ name_ar: e.name_ar, name_en: e.name_en ?? null, sets: e.sets, reps: e.reps, rest_seconds: e.rest_seconds ?? null, youtube_url: e.youtube_url ?? null, notes: e.notes ?? null })) })),
        }),
      }));
      setNotice(t('saved'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function approve(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await readApi(await fetch(`/api/exercise-plans/${planId}/approve`, { method: 'POST' }));
      setNotice(t('approved'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('approveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function addExercise(): void {
    setDays((prev) => prev.map((d, i) => (i === tab ? { ...d, exercises: [...d.exercises, newExercise()] } : d)));
  }

  return (
    <div>
      <h1>{t('editorTitle')}</h1>
      <Tag type={status === 'active' ? 'green' : 'blue'}>{status}</Tag>
      {notice && <InlineNotification kind="success" title={notice} lowContrast onClose={() => setNotice(null)} />}
      {error && <InlineNotification kind="error" title={error} lowContrast onClose={() => setError(null)} />}
      <Tabs selectedIndex={tab} onChange={({ selectedIndex }) => setTab(selectedIndex)}>
        <TabList aria-label={t('editorTitle')}>
          {days.map((d) => (
            <Tab key={d.day}>{`${t('dayLabel')} ${d.day}`}</Tab>
          ))}
        </TabList>
        <TabPanels>
          {days.map((d) => (
            <TabPanel key={d.day}>
              <ExerciseDay day={d} onChange={(next) => setDays((prev) => prev.map((p) => (p.day === d.day ? next : p)))} />
              <Button kind="ghost" size="sm" onClick={addExercise}>{t('addExercise')}</Button>
            </TabPanel>
          ))}
        </TabPanels>
      </Tabs>
      <Button onClick={() => void save()} disabled={busy}>{t('save')}</Button>
      <Button kind="secondary" onClick={() => void approve()} disabled={busy}>{t('approve')}</Button>
      <Button kind="ghost" onClick={() => setBulkOpen(true)}>{t('bulkTitle')}</Button>
      <Button kind="ghost" onClick={() => setCopyOpen(true)}>{t('copyTitle')}</Button>
      <BulkModal planId={planId} open={bulkOpen} onClose={() => { setBulkOpen(false); void load(); }} />
      <CopyDayModal planId={planId} open={copyOpen} onClose={(done) => { setCopyOpen(false); if (done) void load(); }} />
      <RevisionsPanel planId={planId} />
    </div>
  );
}
