'use client';

import { Button, NumberInput, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import type { EditDay, EditExercise } from './exercise-types';

interface Props {
  day: EditDay;
  onChange: (day: EditDay) => void;
}

export default function ExerciseDay({ day, onChange }: Props) {
  const t = useTranslations('exercises');

  function update(index: number, patch: Partial<EditExercise>): void {
    const exercises = day.exercises.map((e, i) => (i === index ? { ...e, ...patch } : e));
    onChange({ ...day, exercises });
  }

  function remove(index: number): void {
    onChange({ ...day, exercises: day.exercises.filter((_, i) => i !== index) });
  }

  function move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= day.exercises.length) return;
    const exercises = [...day.exercises];
    const [moved] = exercises.splice(index, 1);
    exercises.splice(target, 0, moved);
    onChange({ ...day, exercises });
  }

  function drop(from: number, to: number): void {
    if (from === to) return;
    const exercises = [...day.exercises];
    const [moved] = exercises.splice(from, 1);
    exercises.splice(to, 0, moved);
    onChange({ ...day, exercises });
  }

  return (
    <div>
      {day.exercises.map((ex, i) => (
        <Tile
          key={ex.clientId}
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            drop(Number(e.dataTransfer.getData('text/plain')), i);
          }}
        >
          <TextInput id={`ex-name-${ex.clientId}`} labelText={t('exerciseName')} value={ex.name_ar} onChange={(e) => update(i, { name_ar: e.target.value })} />
          <NumberInput id={`ex-sets-${ex.clientId}`} label={t('sets')} value={ex.sets} min={1} max={20} onChange={(_, { value }) => update(i, { sets: Number(value) })} />
          <NumberInput id={`ex-reps-${ex.clientId}`} label={t('reps')} value={ex.reps} min={1} max={500} onChange={(_, { value }) => update(i, { reps: Number(value) })} />
          <NumberInput id={`ex-rest-${ex.clientId}`} label={t('restSeconds')} value={ex.rest_seconds ?? 0} min={0} max={900} onChange={(_, { value }) => update(i, { rest_seconds: Number(value) })} />
          <TextInput id={`ex-yt-${ex.clientId}`} labelText={t('youtubeUrl')} value={ex.youtube_url ?? ''} onChange={(e) => update(i, { youtube_url: e.target.value || null })} />
          <TextInput id={`ex-notes-${ex.clientId}`} labelText={t('notes')} value={ex.notes ?? ''} onChange={(e) => update(i, { notes: e.target.value || null })} />
          <Button kind="ghost" size="sm" onClick={() => move(i, -1)}>{t('moveUp')}</Button>
          <Button kind="ghost" size="sm" onClick={() => move(i, 1)}>{t('moveDown')}</Button>
          <Button kind="danger--ghost" size="sm" onClick={() => remove(i)}>{t('remove')}</Button>
        </Tile>
      ))}
    </div>
  );
}
