// EP-06/07: pure bulk-edit scope resolution for exercises (no DB).
// Anchor by exercise id or normalized name; exclusions are per-position.

export type ExerciseBulkScope = 'day' | 'week' | 'all-weeks';

export interface ScopeExercise {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
}

export interface ScopeDay {
  day: number;
  exercises: ScopeExercise[];
}

export interface ScopeWeekPlan {
  planId: string;
  days: ScopeDay[];
}

export interface ExerciseAnchor {
  day?: number;
  exerciseId?: string;
  exerciseName?: string;
}

export interface ExercisePosition {
  planId: string;
  day: number;
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
}

export function normalizeExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function resolveExercisePositions(
  plans: ScopeWeekPlan[],
  scope: ExerciseBulkScope,
  anchor: ExerciseAnchor,
  exclusions: string[] = []
): ExercisePosition[] {
  const excluded = new Set(exclusions);
  const anchorPlan = anchor.exerciseId
    ? plans.find((p) => p.days.some((d) => d.exercises.some((e) => e.exerciseId === anchor.exerciseId)))
    : plans[0];
  if (!anchorPlan) return [];
  const anchorExercise = anchor.exerciseId
    ? anchorPlan.days.flatMap((d) => d.exercises).find((e) => e.exerciseId === anchor.exerciseId)
    : undefined;
  const key = anchor.exerciseName ? normalizeExerciseName(anchor.exerciseName) : anchorExercise ? normalizeExerciseName(anchorExercise.name) : null;
  if (!key) return [];
  const anchorDay = anchor.day ?? (anchor.exerciseId
    ? anchorPlan.days.find((d) => d.exercises.some((e) => e.exerciseId === anchor.exerciseId))?.day
    : undefined);
  if (scope === 'day' && anchorDay === undefined) return [];
  const out: ExercisePosition[] = [];
  for (const plan of plans) {
    if ((scope === 'day' || scope === 'week') && plan.planId !== anchorPlan.planId) continue;
    for (const day of plan.days) {
      if (scope === 'day' && day.day !== anchorDay) continue;
      for (const ex of day.exercises) {
        if (normalizeExerciseName(ex.name) !== key) continue;
        if (excluded.has(ex.exerciseId)) continue;
        out.push({ planId: plan.planId, day: day.day, exerciseId: ex.exerciseId, name: ex.name, sets: ex.sets, reps: ex.reps });
      }
    }
  }
  return out;
}
