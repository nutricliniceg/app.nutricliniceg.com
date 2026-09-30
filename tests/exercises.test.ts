import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveExercisePositions, normalizeExerciseName, type ScopeWeekPlan } from '@/lib/exercises/scope';
import { extractYoutubeId, youtubeThumbnail } from '@/lib/exercises/youtube';
import { diffExerciseSnapshots, parseExerciseSnapshot } from '@/lib/exercises/exercise-revisions';
import { exerciseEditorService } from '@/lib/exercises/editor.service';
import { exerciseGenerationService } from '@/lib/exercises/generation.service';
import { getAiClientForDoctor } from '@/lib/ai/client';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { exercisesRepository } from '@/lib/db/repositories/exercises.repo';
import { planRevisionsRepository } from '@/lib/db/repositories/plans.repo';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';

vi.mock('@/lib/ai/client', () => ({
  getAiClient: vi.fn(),
  getAiClientForDoctor: vi.fn(),
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/db/repositories/visits.repo', () => ({
  visitsRepository: { listByPatient: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/plans.repo', () => ({
  plansRepository: {},
  planRevisionsRepository: {
    nextRevisionNo: vi.fn().mockResolvedValue(1),
    insert: vi.fn().mockResolvedValue(undefined),
    listByPlan: vi.fn().mockResolvedValue([]),
    getByNo: vi.fn(),
  },
  planGenerationsRepository: { insert: vi.fn(), findByPlan: vi.fn() },
}));

vi.mock('@/lib/db/repositories/exercises.repo', () => ({
  exercisesRepository: {
    insertPlan: vi.fn().mockResolvedValue(undefined),
    findOwnedById: vi.fn(),
    listByPatient: vi.fn().mockResolvedValue([]),
    listByDoctor: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    deleteDaysByPlan: vi.fn().mockResolvedValue(undefined),
    insertDay: vi.fn(),
    insertExercise: vi.fn().mockResolvedValue('ex-new'),
    updateExercise: vi.fn().mockResolvedValue(undefined),
    getFullPlan: vi.fn(),
  },
}));

type Mock = ReturnType<typeof vi.fn>;

function scopePlans(): ScopeWeekPlan[] {
  const squat = (id: string, sets: number) => ({ exerciseId: id, name: 'Squats', sets, reps: 12 });
  return [
    {
      planId: 'week1',
      days: [
        { day: 1, exercises: [squat('m1s', 3), { exerciseId: 'm1p', name: 'Push-ups', sets: 3, reps: 10 }] },
        { day: 4, exercises: [squat('th1s', 3)] },
      ],
    },
    {
      planId: 'week2',
      days: [{ day: 1, exercises: [squat('w2m1s', 4)] }],
    },
  ];
}

const fullPlan = {
  plan: { id: 'p1', patient_id: 'pat1', status: 'pending_doctor_approval' },
  days: [
    {
      day: { id: 'd1', plan_id: 'p1', day_of_week: 1 },
      exercises: [
        { id: 'm1s', day_id: 'd1', name_ar: 'Squats', name_en: 'Squats', sets: 3, reps: 12, rest_seconds: 60, youtube_url: null, notes: null, order_index: 0 },
      ],
    },
    {
      day: { id: 'd4', plan_id: 'p1', day_of_week: 4 },
      exercises: [],
    },
  ],
};

beforeEach(() => { vi.clearAllMocks(); });

describe('P17 exercise bulk scope', () => {
  it('counts squats per scope with exclusions honored', () => {
    const plans = scopePlans();
    expect(resolveExercisePositions(plans, 'day', { exerciseId: 'm1s' })).toHaveLength(1);
    expect(resolveExercisePositions(plans, 'week', { exerciseId: 'm1s' })).toHaveLength(2);
    expect(resolveExercisePositions(plans, 'all-weeks', { exerciseId: 'm1s' })).toHaveLength(3);
    expect(resolveExercisePositions(plans, 'all-weeks', { exerciseName: 'squats' })).toHaveLength(3);
    expect(resolveExercisePositions(plans, 'all-weeks', { exerciseId: 'm1s' }, ['th1s', 'w2m1s'])).toHaveLength(1);
  });

  it('normalizes names for matching', () => {
    expect(normalizeExerciseName('  Squats  ')).toBe('squats');
  });
});

describe('P17 exercise youtube', () => {
  it('derives ids from all URL shapes and rejects junk', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeId('not a url')).toBeNull();
    expect(extractYoutubeId(null)).toBeNull();
    expect(youtubeThumbnail('dQw4w9WgXcQ')).toContain('dQw4w9WgXcQ');
  });
});

describe('P17 exercise revisions', () => {
  it('diffs volume changes and rejects foreign snapshots', () => {
    const prev = { version: 1 as const, kind: 'exercise' as const, status: 'draft', days: [{ day: 1, exercises: [{ exerciseId: 'a', nameAr: 'Squats', nameEn: null, sets: 3, reps: 12, restSeconds: null, youtubeUrl: null, notes: null }] }] };
    const next = { version: 1 as const, kind: 'exercise' as const, status: 'draft', days: [{ day: 1, exercises: [{ exerciseId: 'a', nameAr: 'Squats', nameEn: null, sets: 4, reps: 12, restSeconds: null, youtubeUrl: null, notes: null }] }] };
    expect(diffExerciseSnapshots(prev, next)).toEqual({ added: 0, removed: 0, volumeChanged: 1 });
    expect(parseExerciseSnapshot(JSON.stringify({ version: 1, kind: 'nutrition', days: [] }))).toBeNull();
  });
});

describe('P17 exercise approval gate', () => {
  it('publishes pending plans and blocks the rest', async () => {
    (exercisesRepository.getFullPlan as Mock).mockResolvedValue(fullPlan);
    const okResult = await exerciseEditorService.approve('p1', 'doc1');
    expect(okResult?.status).toBe('active');
    (exercisesRepository.getFullPlan as Mock).mockResolvedValue({ plan: { status: 'active' }, days: fullPlan.days });
    await expect(exerciseEditorService.approve('p1', 'doc1')).rejects.toMatchObject({ code: 'INVALID_STATUS' });
    (exercisesRepository.getFullPlan as Mock).mockResolvedValue({ plan: { status: 'archived' }, days: [] });
    await expect(exerciseEditorService.approve('p1', 'doc1')).rejects.toMatchObject({ code: 'ARCHIVED' });
    (exercisesRepository.getFullPlan as Mock).mockResolvedValue({ plan: { status: 'pending_doctor_approval' }, days: [] });
    await expect(exerciseEditorService.approve('p1', 'doc1')).rejects.toMatchObject({ code: 'EMPTY_PLAN' });
  });
});

describe('P17 exercise copy day + undo', () => {
  it('copies Monday to Thursday', async () => {
    (exercisesRepository.getFullPlan as Mock).mockResolvedValue(fullPlan);
    (exercisesRepository.listByPatient as Mock).mockResolvedValue([]);
    (exercisesRepository.insertDay as Mock).mockResolvedValue('d-new');
    (planRevisionsRepository.nextRevisionNo as Mock).mockResolvedValue(1);
    const result = await exerciseEditorService.copyDay('p1', 'doc1', { from_day: 1, to_days: [4] });
    expect(result?.copied).toBe(1);
    expect(exercisesRepository.insertExercise as Mock).toHaveBeenCalledWith('d4', expect.objectContaining({ nameAr: 'Squats', sets: 3 }), 0);
  });

  it('undo restores the pre-apply revision', async () => {
    const pre = JSON.stringify({
      version: 1, kind: 'exercise', status: 'pending_doctor_approval',
      days: [{ day: 1, exercises: [{ exerciseId: 'm1s', nameAr: 'Squats', nameEn: null, sets: 3, reps: 12, restSeconds: 60, youtubeUrl: null, notes: null }] }],
    });
    (exercisesRepository.getFullPlan as Mock).mockResolvedValue(fullPlan);
    (planRevisionsRepository.getByNo as Mock).mockResolvedValue({ snapshot: pre });
    const result = await exerciseEditorService.restoreRevision('p1', 'doc1', 1);
    expect(result?.restoredFrom).toBe(1);
    expect(exercisesRepository.deleteDaysByPlan as Mock).toHaveBeenCalledWith('p1');
    expect(exercisesRepository.insertExercise as Mock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ sets: 3, reps: 12 }), 0);
  });

  it('bulk apply writes pre/post revisions for undo', async () => {
    (exercisesRepository.getFullPlan as Mock).mockResolvedValue(fullPlan);
    (exercisesRepository.listByPatient as Mock).mockResolvedValue([{ id: 'p1', status: 'pending_doctor_approval' }]);
    (planRevisionsRepository.nextRevisionNo as Mock).mockResolvedValueOnce(5).mockResolvedValueOnce(6);
    const result = await exerciseEditorService.bulkEdit('p1', 'doc1', {
      scope: 'all-weeks', anchor: { exercise_name: 'Squats' }, op: { type: 'set_sets', sets: 5 },
    });
    expect(result && 'count' in result && result.count).toBe(1);
    expect(planRevisionsRepository.insert as Mock).toHaveBeenCalledTimes(2);
    expect(exercisesRepository.updateExercise as Mock).toHaveBeenCalledWith('m1s', { sets: 5 });
  });
});

describe('P17 exercise AI generation', () => {
  it('generates a beginner weekly draft, drops bad youtube URLs', async () => {
    (patientRepository.findById as Mock).mockResolvedValue({
      id: 'pat1', doctor_id: 'doc1', gender: 'female', birth_date: new Date('1990-01-01'),
      height_cm: 165, initial_weight_kg: 70, current_weight_kg: 70,
      activity_level: 'moderate', goal: 'lose', chronic_conditions: null, allergies: null,
    });
    (getAiClientForDoctor as Mock).mockResolvedValue({
      chatJson: vi.fn().mockResolvedValue({
        days: [{
          day: 1,
          exercises: [
            { name_ar: 'سكوات', sets: 3, reps: 12, rest_seconds: 60, youtube_url: 'https://youtu.be/dQw4w9WgXcQ' },
            { name_ar: 'ضغط', sets: 3, reps: 10, rest_seconds: 60, youtube_url: 'junk-url' },
          ],
        }],
      }),
    });
    const result = await exerciseGenerationService.generate('doc1', {
      patient_id: 'pat1', goal: 'lose', level: 'beginner', days_per_week: 1,
    }, false);
    expect(result.status).toBe('pending_doctor_approval');
    expect(result.exerciseCount).toBe(2);
    expect(result.disclaimer).toBeTruthy();
    const calls = (exercisesRepository.insertExercise as Mock).mock.calls as Array<[string, Record<string, unknown>, number]>;
    expect(calls).toHaveLength(2);
    expect(calls[0][1].youtubeUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(calls[1][1].youtubeUrl).toBeNull();
  });
});

describe('P17 patients/visits mocks sane', () => {
  it('keeps mock handles referenced', () => {
    expect(patientRepository).toBeTruthy();
    expect(visitsRepository).toBeTruthy();
  });
});
