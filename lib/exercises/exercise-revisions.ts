import type { FullExercisePlan } from '@/lib/db/repositories/exercises.repo';

// Exercise revision snapshots (plan_type='exercise'). Same append-only
// contract as nutrition: restores always append, never rewrite history.

export interface ExerciseSnapshotItem {
  exerciseId: string | null;
  nameAr: string;
  nameEn: string | null;
  sets: number;
  reps: number;
  restSeconds: number | null;
  youtubeUrl: string | null;
  notes: string | null;
}

export interface ExerciseSnapshotDay {
  day: number;
  exercises: ExerciseSnapshotItem[];
}

export interface ExerciseSnapshot {
  version: 1;
  kind: 'exercise';
  status: string;
  days: ExerciseSnapshotDay[];
}

export function buildExerciseSnapshot(full: FullExercisePlan, status: string): ExerciseSnapshot {
  return {
    version: 1,
    kind: 'exercise',
    status,
    days: full.days.map((d) => ({
      day: Number(d.day.day_of_week),
      exercises: d.exercises.map((e) => ({
        exerciseId: e.id,
        nameAr: e.name_ar,
        nameEn: e.name_en,
        sets: Number(e.sets),
        reps: Number(e.reps),
        restSeconds: e.rest_seconds == null ? null : Number(e.rest_seconds),
        youtubeUrl: e.youtube_url,
        notes: (e as { notes?: string | null }).notes ?? null,
      })),
    })),
  };
}

export interface ExerciseSnapshotDiff {
  added: number;
  removed: number;
  volumeChanged: number;
}

function exKey(day: number, item: ExerciseSnapshotItem): string {
  return `${day}|${item.exerciseId ?? `name:${item.nameAr.trim().toLowerCase()}`}`;
}

export function diffExerciseSnapshots(prev: ExerciseSnapshot, next: ExerciseSnapshot): ExerciseSnapshotDiff {
  const prevMap = new Map<string, ExerciseSnapshotItem>();
  for (const d of prev.days) for (const e of d.exercises) prevMap.set(exKey(d.day, e), e);
  const nextMap = new Map<string, ExerciseSnapshotItem>();
  for (const d of next.days) for (const e of d.exercises) nextMap.set(exKey(d.day, e), e);
  let added = 0;
  let removed = 0;
  let volumeChanged = 0;
  for (const [key, item] of nextMap) {
    const old = prevMap.get(key);
    if (!old) added += 1;
    else if (old.sets !== item.sets || old.reps !== item.reps) volumeChanged += 1;
  }
  for (const key of prevMap.keys()) if (!nextMap.has(key)) removed += 1;
  return { added, removed, volumeChanged };
}

export function parseExerciseSnapshot(raw: string): ExerciseSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as ExerciseSnapshot;
    if (!parsed || parsed.version !== 1 || parsed.kind !== 'exercise' || !Array.isArray(parsed.days)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface ExerciseRevisionSummary {
  revision_no: number;
  change_note: string | null;
  changed_by: string;
  created_at: Date;
  summary: ExerciseSnapshotDiff;
}

export function summarizeExerciseRevisions(
  rows: Array<{ revision_no: number; change_note: string | null; changed_by: string; created_at: Date; snapshot: string }>
): ExerciseRevisionSummary[] {
  const parsed = rows.map((r) => ({ row: r, snapshot: parseExerciseSnapshot(r.snapshot) }));
  return parsed.map(({ row, snapshot }, idx) => {
    const older = parsed[idx + 1]?.snapshot;
    const diff = snapshot && older ? diffExerciseSnapshots(older, snapshot) : { added: 0, removed: 0, volumeChanged: 0 };
    return { revision_no: row.revision_no, change_note: row.change_note, changed_by: row.changed_by, created_at: row.created_at, summary: diff };
  });
}
