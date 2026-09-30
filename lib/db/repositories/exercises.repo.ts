import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface ExercisePlanRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  week_number: number;
  status: 'draft' | 'pending_doctor_approval' | 'active' | 'archived';
  approved_by: string | null;
  approved_at: Date | null;
}

export interface ExerciseDayRow {
  id: string;
  plan_id: string;
  day_of_week: number;
}

export interface ExerciseItemRow {
  id: string;
  day_id: string;
  name_ar: string;
  name_en: string | null;
  sets: number;
  reps: number;
  rest_seconds: number | null;
  youtube_url: string | null;
  notes: string | null;
  order_index: number;
}

export interface FullExercisePlan {
  plan: Record<string, unknown>;
  days: Array<{ day: ExerciseDayRow; exercises: ExerciseItemRow[] }>;
}

export interface ExerciseInsert {
  nameAr: string;
  nameEn?: string | null;
  sets: number;
  reps: number;
  restSeconds?: number | null;
  youtubeUrl?: string | null;
  notes?: string | null;
}

export const exercisesRepository = {
  insertPlan: async (data: { id: string; patientId: string; doctorId: string; weekNumber: number; status: ExercisePlanRow['status'] }): Promise<void> => {
    await executeQuery(
      'INSERT INTO ExercisePlan (id, patient_id, doctor_id, week_number, status) VALUES (?, ?, ?, ?, ?)',
      [data.id, data.patientId, data.doctorId, data.weekNumber, data.status]
    );
  },

  findOwnedById: async (id: string, doctorId: string): Promise<ExercisePlanRow | null> => {
    const rows = await executeQuery<ExercisePlanRow[]>(
      'SELECT * FROM ExercisePlan WHERE id = ? AND doctor_id = ?',
      [id, doctorId]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  findPublicById: async (id: string): Promise<{ id: string; doctor_id: string } | null> => {
    const rows = await executeQuery<{ id: string; doctor_id: string }[]>(
      'SELECT id, doctor_id FROM ExercisePlan WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  listByPatient: async (doctorId: string, patientId: string): Promise<ExercisePlanRow[]> => {
    return executeQuery<ExercisePlanRow[]>(
      'SELECT * FROM ExercisePlan WHERE doctor_id = ? AND patient_id = ? ORDER BY week_number ASC, created_at ASC',
      [doctorId, patientId]
    );
  },

  listByDoctor: async (doctorId: string, patientId: string | null, page: number, limit: number): Promise<{ plans: Record<string, unknown>[]; total: number }> => {
    const offset = (page - 1) * limit;
    const where = patientId ? 'doctor_id = ? AND patient_id = ?' : 'doctor_id = ?';
    const params: string[] = patientId ? [doctorId, patientId] : [doctorId];
    const [plans, totalRows] = await Promise.all([
      executeQuery<Record<string, unknown>[]>(
        // eslint-disable-next-line no-restricted-syntax -- WHERE fragment is fixed; values use ? placeholders (D-01)
        `SELECT * FROM ExercisePlan WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      executeQuery<{ count: number }[]>(
        // eslint-disable-next-line no-restricted-syntax -- WHERE fragment is fixed; values use ? placeholders (D-01)
        `SELECT COUNT(*) as count FROM ExercisePlan WHERE ${where}`,
        params
      ),
    ]);
    return { plans, total: totalRows[0].count };
  },

  updateStatus: async (id: string, doctorId: string, status: ExercisePlanRow['status'], approvedBy: string | null = null): Promise<void> => {
    if (status === 'active') {
      await executeQuery(
        'UPDATE ExercisePlan SET status = ?, approved_by = ?, approved_at = ? WHERE id = ? AND doctor_id = ?',
        [status, approvedBy, new Date(), id, doctorId]
      );
    } else {
      await executeQuery('UPDATE ExercisePlan SET status = ?, approved_by = NULL, approved_at = NULL WHERE id = ? AND doctor_id = ?', [status, id, doctorId]);
    }
  },

  deleteDaysByPlan: async (planId: string): Promise<void> => {
    await executeQuery('DELETE FROM ExercisePlanDay WHERE plan_id = ?', [planId]);
  },

  insertDay: async (planId: string, dayOfWeek: number): Promise<string> => {
    const id = randomUUID();
    await executeQuery('INSERT INTO ExercisePlanDay (id, plan_id, day_of_week) VALUES (?, ?, ?)', [id, planId, dayOfWeek]);
    return id;
  },

  insertExercise: async (dayId: string, data: ExerciseInsert, orderIndex: number): Promise<string> => {
    const id = randomUUID();
    await executeQuery(
      'INSERT INTO ExercisePlanExercise (id, day_id, name_ar, name_en, sets, reps, rest_seconds, youtube_url, notes, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, dayId, data.nameAr, data.nameEn ?? null, data.sets, data.reps, data.restSeconds ?? null, data.youtubeUrl ?? null, data.notes ?? null, orderIndex]
    );
    return id;
  },

  updateExercise: async (id: string, patch: { sets?: number; reps?: number; restSeconds?: number | null }): Promise<void> => {
    const fields: string[] = [];
    const values: Array<number | string | null> = [];
    if (patch.sets !== undefined) {
      fields.push('sets = ?');
      values.push(patch.sets);
    }
    if (patch.reps !== undefined) {
      fields.push('reps = ?');
      values.push(patch.reps);
    }
    if (patch.restSeconds !== undefined) {
      fields.push('rest_seconds = ?');
      values.push(patch.restSeconds);
    }
    if (fields.length === 0) return;
    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- SET columns are fixed literals; values use ? placeholders (D-01)
    await executeQuery(`UPDATE ExercisePlanExercise SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  getFullPlan: async (id: string, doctorId: string): Promise<FullExercisePlan | null> => {
    const rows = await executeQuery<Record<string, unknown>[]>(
      'SELECT * FROM ExercisePlan WHERE id = ? AND doctor_id = ?',
      [id, doctorId]
    );
    if (rows.length === 0) return null;
    const days = await executeQuery<ExerciseDayRow[]>(
      'SELECT * FROM ExercisePlanDay WHERE plan_id = ? ORDER BY day_of_week ASC, created_at ASC',
      [id]
    );
    // PF-02: single batched exercises query (was N+1 per day).
    const dayIds = days.map((d) => d.id);
    let allExercises: ExerciseItemRow[] = [];
    if (dayIds.length > 0) {
      allExercises = await executeQuery<ExerciseItemRow[]>(
        // eslint-disable-next-line no-restricted-syntax -- placeholders are bound per id; values use ? (D-01)
        `SELECT * FROM ExercisePlanExercise WHERE day_id IN (${dayIds.map(() => '?').join(',')}) ORDER BY order_index ASC, created_at ASC`,
        dayIds
      );
    }
    const byDay = new Map<string, ExerciseItemRow[]>();
    for (const ex of allExercises) {
      const list = byDay.get(ex.day_id) ?? [];
      list.push(ex);
      byDay.set(ex.day_id, list);
    }
    return { plan: rows[0], days: days.map((day) => ({ day, exercises: byDay.get(day.id) ?? [] })) };
  },
};
