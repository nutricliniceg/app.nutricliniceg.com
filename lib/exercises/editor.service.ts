import { randomUUID } from 'crypto';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { exercisesRepository, type FullExercisePlan } from '@/lib/db/repositories/exercises.repo';
import { planRevisionsRepository } from '@/lib/db/repositories/plans.repo';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';
import { fail, type PatientForPlan } from '@/lib/plans';
import { buildExerciseSnapshot, summarizeExerciseRevisions, parseExerciseSnapshot } from './exercise-revisions';
import { resolveExercisePositions, type ExerciseBulkScope, type ScopeWeekPlan } from './scope';
import { enrichYoutube } from './youtube';
import type { ExerciseSaveInput, ExerciseBulkInput, ExerciseCopyDayInput } from './exercises.schema';

type PlanStatus = 'draft' | 'pending_doctor_approval' | 'active' | 'archived';

function statusOf(full: FullExercisePlan): PlanStatus {
  return String((full.plan as { status: string }).status) as PlanStatus;
}

async function toScopePlans(planIds: string[], doctorId: string): Promise<ScopeWeekPlan[]> {
  const out: ScopeWeekPlan[] = [];
  for (const pid of planIds) {
    const full = await exercisesRepository.getFullPlan(pid, doctorId);
    if (!full) continue;
    out.push({
      planId: pid,
      days: full.days.map((d) => ({
        day: Number(d.day.day_of_week),
        exercises: d.exercises.map((e) => ({ exerciseId: e.id, name: e.name_ar, sets: Number(e.sets), reps: Number(e.reps) })),
      })),
    });
  }
  return out;
}

async function snapshotRevision(planId: string, doctorId: string, note: string | null): Promise<void> {
  const full = await exercisesRepository.getFullPlan(planId, doctorId);
  if (!full) return;
  const no = await planRevisionsRepository.nextRevisionNo(planId);
  await planRevisionsRepository.insert({
    planType: 'exercise', planId, revisionNo: no,
    snapshot: buildExerciseSnapshot(full, statusOf(full)), changedBy: doctorId, changeNote: note,
  });
}

export const exerciseEditorService = {
  async getEditable(planId: string, doctorId: string) {
    const full = await exercisesRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    const patient = (await patientRepository.findById(String((full.plan as { patient_id: string }).patient_id))) as PatientForPlan | null;
    if (!patient || patient.doctor_id !== doctorId) return null;
    return {
      plan: full.plan,
      days: full.days.map((d) => ({
        dayId: d.day.id,
        day: Number(d.day.day_of_week),
        exercises: d.exercises.map((e) => ({ ...e, video: enrichYoutube(e.youtube_url) })),
      })),
      patient: { id: patient.id, nameAr: (patient as { name_ar?: string }).name_ar ?? '' },
    };
  },

  async save(planId: string, doctorId: string, input: ExerciseSaveInput) {
    const full = await exercisesRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    if (statusOf(full) === 'archived') throw fail('ARCHIVED', 'Archived plans cannot be edited');
    await snapshotRevision(planId, doctorId, input.change_note ?? 'Edit before save');
    await exercisesRepository.deleteDaysByPlan(planId);
    for (const day of input.days) {
      const dayId = await exercisesRepository.insertDay(planId, day.day);
      let order = 0;
      for (const ex of day.exercises) {
        await exercisesRepository.insertExercise(dayId, {
          nameAr: ex.name_ar, nameEn: ex.name_en ?? null, sets: ex.sets, reps: ex.reps,
          restSeconds: ex.rest_seconds ?? null, youtubeUrl: ex.youtube_url ?? null, notes: ex.notes ?? null,
        }, order);
        order += 1;
      }
    }
    const updated = await exercisesRepository.getFullPlan(planId, doctorId);
    if (updated) {
      const no = await planRevisionsRepository.nextRevisionNo(planId);
      await planRevisionsRepository.insert({
        planType: 'exercise', planId, revisionNo: no,
        snapshot: buildExerciseSnapshot(updated, statusOf(updated)), changedBy: doctorId, changeNote: input.change_note ?? 'Saved',
      });
    }
    return { planId };
  },

  async approve(planId: string, doctorId: string) {
    const full = await exercisesRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    const status = statusOf(full);
    if (status === 'archived') throw fail('ARCHIVED', 'Archived plans cannot be approved');
    if (status === 'active') throw fail('INVALID_STATUS', 'Plan is already active');
    if (status !== 'pending_doctor_approval') throw fail('INVALID_STATUS', 'Only drafts pending approval can be published');
    const count = full.days.reduce((s, d) => s + d.exercises.length, 0);
    if (count === 0) throw fail('EMPTY_PLAN', 'Cannot publish a plan with no exercises');
    await exercisesRepository.updateStatus(planId, doctorId, 'active', doctorId);
    return { planId, status: 'active' as const, exerciseCount: count };
  },

  async bulkEdit(planId: string, doctorId: string, input: ExerciseBulkInput) {
    const anchor = await exercisesRepository.getFullPlan(planId, doctorId);
    if (!anchor) return null;
    if (statusOf(anchor) === 'archived') throw fail('ARCHIVED', 'Archived plans cannot be edited');
    const patientId = String((anchor.plan as { patient_id: string }).patient_id);
    const scope = input.scope as ExerciseBulkScope;
    const planIds = scope === 'all-weeks'
      ? (await exercisesRepository.listByPatient(doctorId, patientId))
          .filter((p) => p.status !== 'archived')
          .map((p) => p.id)
      : [planId];
    if (!planIds.includes(planId)) planIds.push(planId);
    const scopePlans = await toScopePlans(planIds, doctorId);
    const positions = resolveExercisePositions(scopePlans, scope, {
      day: input.anchor.day, exerciseId: input.anchor.exercise_id, exerciseName: input.anchor.exercise_name,
    }, input.exclusions ?? []);
    if (input.preview) return { preview: true as const, count: positions.length, positions };
    if (positions.length === 0) throw fail('NO_POSITIONS', 'No matching exercises for this scope');
    await snapshotRevision(planId, doctorId, input.change_note ?? 'Bulk edit (pre-apply)');
    const patch = input.op.type === 'set_sets' ? { sets: input.op.sets }
      : input.op.type === 'set_reps' ? { reps: input.op.reps }
      : { restSeconds: input.op.rest_seconds };
    for (const pos of positions) await exercisesRepository.updateExercise(pos.exerciseId, patch);
    const undoNo = await planRevisionsRepository.nextRevisionNo(planId);
    const after = await exercisesRepository.getFullPlan(planId, doctorId);
    if (after) {
      await planRevisionsRepository.insert({
        planType: 'exercise', planId, revisionNo: undoNo,
        snapshot: buildExerciseSnapshot(after, statusOf(after)), changedBy: doctorId, changeNote: input.change_note ?? 'Bulk edit applied',
      });
    }
    return { preview: false as const, count: positions.length, undoRevisionNo: undoNo - 1 };
  },

  async copyDay(planId: string, doctorId: string, input: ExerciseCopyDayInput) {
    const full = await exercisesRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    if (statusOf(full) === 'archived') throw fail('ARCHIVED', 'Archived plans cannot be edited');
    const source = full.days.find((d) => Number(d.day.day_of_week) === input.from_day);
    if (!source || source.exercises.length === 0) throw fail('EMPTY_DAY', 'Source day has no exercises to copy');
    const patientId = String((full.plan as { patient_id: string }).patient_id);
    const targets = new Map<string, number[]>();
    targets.set(planId, input.to_days.filter((d) => d !== input.from_day));
    for (const weekNo of input.to_week_numbers ?? []) {
      const plans = await exercisesRepository.listByPatient(doctorId, patientId);
      const match = plans.find((p) => p.week_number === weekNo && p.status !== 'archived');
      if (!match) continue;
      const existing = targets.get(match.id) ?? [];
      for (const d of input.to_days) if (!existing.includes(d)) existing.push(d);
      targets.set(match.id, existing);
    }
    await snapshotRevision(planId, doctorId, input.change_note ?? `Copy day ${input.from_day} (pre-apply)`);
    let copied = 0;
    for (const [targetPlanId, days] of targets) {
      if (days.length === 0) continue;
      const target = await exercisesRepository.getFullPlan(targetPlanId, doctorId);
      if (!target) continue;
      for (const dayNo of days) {
        const existing = target.days.find((d) => Number(d.day.day_of_week) === dayNo);
        const dayId = existing ? existing.day.id : await exercisesRepository.insertDay(targetPlanId, dayNo);
        const startOrder = existing ? existing.exercises.length : 0;
        let order = startOrder;
        for (const ex of source.exercises) {
          await exercisesRepository.insertExercise(dayId, {
            nameAr: ex.name_ar, nameEn: ex.name_en, sets: Number(ex.sets), reps: Number(ex.reps),
            restSeconds: ex.rest_seconds == null ? null : Number(ex.rest_seconds),
            youtubeUrl: ex.youtube_url, notes: (ex as { notes?: string | null }).notes ?? null,
          }, order);
          order += 1;
          copied += 1;
        }
      }
      if (targetPlanId !== planId) await snapshotRevision(targetPlanId, doctorId, input.change_note ?? `Copy day ${input.from_day} received`);
    }
    return { copied };
  },

  async listRevisions(planId: string, doctorId: string) {
    const full = await exercisesRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    const rows = await planRevisionsRepository.listByPlan(planId, 'exercise');
    return summarizeExerciseRevisions(rows);
  },

  async restoreRevision(planId: string, doctorId: string, revisionNo: number, note?: string | null) {
    const full = await exercisesRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    if (statusOf(full) === 'archived') throw fail('ARCHIVED', 'Archived plans cannot be edited');
    const row = await planRevisionsRepository.getByNo(planId, revisionNo);
    if (!row) throw fail('NOT_FOUND', 'Revision not found');
    const snapshot = parseExerciseSnapshot(row.snapshot);
    if (!snapshot) throw fail('INVALID_REVISION', 'Revision snapshot is not an exercise snapshot');
    await snapshotRevision(planId, doctorId, 'Pre-restore backup');
    await exercisesRepository.deleteDaysByPlan(planId);
    for (const day of snapshot.days) {
      const dayId = await exercisesRepository.insertDay(planId, day.day);
      let order = 0;
      for (const ex of day.exercises) {
        await exercisesRepository.insertExercise(dayId, {
          nameAr: ex.nameAr, nameEn: ex.nameEn, sets: ex.sets, reps: ex.reps,
          restSeconds: ex.restSeconds, youtubeUrl: ex.youtubeUrl, notes: ex.notes,
        }, order);
        order += 1;
      }
    }
    return { planId, restoredFrom: revisionNo };
  },

  async suggestAdaptive(doctorId: string, patientId: string, sourcePlanId?: string | null) {
    const patient = (await patientRepository.findById(patientId)) as PatientForPlan | null;
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Patient not found');
    const visits = await visitsRepository.listByPatient(patientId, doctorId);
    const weightUsed = visits.find((v) => v.weight_kg != null)?.weight_kg ?? patient.current_weight_kg ?? patient.initial_weight_kg;
    let sourceId = sourcePlanId ?? null;
    if (!sourceId) {
      const plans = await exercisesRepository.listByPatient(doctorId, patientId);
      const active = plans.find((p) => p.status === 'active') ?? plans.find((p) => p.status !== 'archived');
      if (!active) throw fail('NO_ACTIVE_PLAN', 'No active exercise plan to adapt — generate one first');
      sourceId = active.id;
    }
    const source = await exercisesRepository.getFullPlan(sourceId, doctorId);
    if (!source) throw fail('NOT_FOUND', 'Source plan not found');
    const planId = randomUUID();
    await exercisesRepository.insertPlan({ id: planId, patientId, doctorId, weekNumber: Number((source.plan as { week_number: number }).week_number ?? 1), status: 'pending_doctor_approval' });
    for (const day of source.days) {
      const dayId = await exercisesRepository.insertDay(planId, Number(day.day.day_of_week));
      let order = 0;
      for (const ex of day.exercises) {
        await exercisesRepository.insertExercise(dayId, {
          nameAr: ex.name_ar, nameEn: ex.name_en, sets: Number(ex.sets), reps: Number(ex.reps),
          restSeconds: ex.rest_seconds == null ? null : Number(ex.rest_seconds),
          youtubeUrl: ex.youtube_url, notes: (ex as { notes?: string | null }).notes ?? null,
        }, order);
        order += 1;
      }
    }
    const no = await planRevisionsRepository.nextRevisionNo(planId);
    const created = await exercisesRepository.getFullPlan(planId, doctorId);
    if (created) {
      await planRevisionsRepository.insert({
        planType: 'exercise', planId, revisionNo: no,
        snapshot: buildExerciseSnapshot(created, 'pending_doctor_approval'), changedBy: doctorId,
        changeNote: `Adaptive suggestion from weight ${Number(weightUsed)}kg`,
      });
    }
    return { planId, weightUsedKg: Number(weightUsed), sourcePlanId: sourceId };
  },
};
