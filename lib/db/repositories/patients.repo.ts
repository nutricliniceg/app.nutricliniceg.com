import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

// Database row type (what comes from MySQL)
interface PatientRow {
  id: string;
  doctor_id: string;
  name_ar: string;
  name_en: string | null;
  gender: 'male' | 'female';
  birth_date: Date;
  height_cm: number;
  initial_weight_kg: number;
  current_weight_kg: number | null;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
  medical_notes: string | null;
  chronic_conditions: string | null;
  allergies: string | null;
  consent_ai_sharing_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Patient {
  id: string;
  doctor_id: string;
  name_ar: string;
  name_en: string | null;
  gender: 'male' | 'female';
  birth_date: Date;
  height_cm: number;
  initial_weight_kg: number;
  current_weight_kg: number | null;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
  medical_notes: string | null;
  chronic_conditions: string[] | null;
  allergies: string[] | null;
  consent_ai_sharing_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRowToPatient(row: PatientRow): Patient {
  return {
    ...row,
    chronic_conditions:
      typeof row.chronic_conditions === 'string' && row.chronic_conditions
        ? JSON.parse(row.chronic_conditions)
        : null,
    allergies:
      typeof row.allergies === 'string' && row.allergies ? JSON.parse(row.allergies) : null,
  };
}

export interface PatientCreateInput {
  name_ar: string;
  name_en?: string | null;
  gender: 'male' | 'female';
  birth_date: string;
  height_cm: number;
  initial_weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
  medical_notes?: string | null;
  chronic_conditions?: string[] | null;
  allergies?: string[] | null;
  consent_ai_sharing?: boolean;
}

export interface PatientListParams {
  page?: number;
  limit?: number;
  search?: string;
  gender?: 'male' | 'female';
  status?: string;
}

export interface PatientListResult {
  patients: Patient[];
  total: number;
  page: number;
  limit: number;
}

export const patientRepository = {
  create: async (doctorId: string, data: PatientCreateInput): Promise<string> => {
    const patientId = randomUUID();
    const now = new Date();

    await executeQuery(
      `INSERT INTO Patient (
        id, doctor_id, name_ar, name_en, gender, birth_date, height_cm, 
        initial_weight_kg, current_weight_kg, activity_level, goal, 
        medical_notes, chronic_conditions, allergies, consent_ai_sharing_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        doctorId,
        data.name_ar,
        data.name_en ?? null,
        data.gender,
        data.birth_date,
        data.height_cm,
        data.initial_weight_kg,
        data.initial_weight_kg,
        data.activity_level,
        data.goal,
        data.medical_notes ?? null,
        data.chronic_conditions ? JSON.stringify(data.chronic_conditions) : null,
        data.allergies ? JSON.stringify(data.allergies) : null,
        data.consent_ai_sharing ? now : null,
        now,
        now,
      ]
    );

    return patientId;
  },

  findById: async (id: string): Promise<Patient | null> => {
    const rows = await executeQuery<PatientRow[]>('SELECT * FROM Patient WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    return mapRowToPatient(rows[0]);
  },

  findByDoctor: async (doctorId: string, params: PatientListParams = {}): Promise<PatientListResult> => {
    const { page = 1, limit = 20, search, gender } = params;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE doctor_id = ?';
    const whereParams: Array<string | number | Date | null> = [doctorId];

    if (search) {
      whereClause += ' AND (name_ar LIKE ? OR name_en LIKE ?)';
      whereParams.push(`%${search}%`, `%${search}%`);
    }

    if (gender) {
      whereClause += ' AND gender = ?';
      whereParams.push(gender);
    }

    const [patients, totalRows] = await Promise.all([
      executeQuery<PatientRow[]>(
        // eslint-disable-next-line no-restricted-syntax -- whereClause is assembled from fixed string constants only; every value uses ? placeholders (D-01)
        `SELECT * FROM Patient ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...whereParams, limit, offset]
      ),
      executeQuery<{ count: number }[]>(
        // eslint-disable-next-line no-restricted-syntax -- whereClause is assembled from fixed string constants only; every value uses ? placeholders (D-01)
        `SELECT COUNT(*) as count FROM Patient ${whereClause}`,
        whereParams
      ),
    ]);

    return {
      patients: patients.map(mapRowToPatient),
      total: totalRows[0].count,
      page,
      limit,
    };
  },

  update: async (id: string, doctorId: string, data: Partial<PatientCreateInput>): Promise<void> => {
    const fields: string[] = [];
    const values: Array<string | number | boolean | Date | null> = [];

    const fieldMap: Record<string, string> = {
      name_ar: 'name_ar',
      name_en: 'name_en',
      gender: 'gender',
      birth_date: 'birth_date',
      height_cm: 'height_cm',
      initial_weight_kg: 'initial_weight_kg',
      current_weight_kg: 'current_weight_kg',
      activity_level: 'activity_level',
      goal: 'goal',
      medical_notes: 'medical_notes',
      chronic_conditions: 'chronic_conditions',
      allergies: 'allergies',
    };

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && fieldMap[key]) {
        if (key === 'chronic_conditions' || key === 'allergies') {
          fields.push(`${fieldMap[key]} = ?`);
          values.push(value ? JSON.stringify(value) : null);
        } else {
          fields.push(`${fieldMap[key]} = ?`);
          values.push(value as string | number | boolean | Date | null);
        }
      }
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(new Date());
    values.push(id);
    values.push(doctorId);

    await executeQuery(
      // eslint-disable-next-line no-restricted-syntax -- SET columns come from a fixed allowlist map; every value uses ? placeholders (D-01)
      `UPDATE Patient SET ${fields.join(', ')} WHERE id = ? AND doctor_id = ?`,
      values
    );
  },

  delete: async (id: string, doctorId: string): Promise<void> => {
    await executeQuery('DELETE FROM Patient WHERE id = ? AND doctor_id = ?', [id, doctorId]);
  },

  updateWeight: async (id: string, doctorId: string, weightKg: number): Promise<void> => {
    await executeQuery(
      'UPDATE Patient SET current_weight_kg = ?, updated_at = ? WHERE id = ? AND doctor_id = ?',
      [weightKg, new Date(), id, doctorId]
    );
  },

  // CMP-02 consent capture for AI sharing (AI-25 inline flow).
  setConsentAiSharing: async (id: string, doctorId: string): Promise<void> => {
    await executeQuery(
      'UPDATE Patient SET consent_ai_sharing_at = ? WHERE id = ? AND doctor_id = ?',
      [new Date(), id, doctorId]
    );
  },

  getStats: async (doctorId: string): Promise<{ total: number; visitsThisWeek: number; activePlans: number }> => {
    const [totalResult, visitsResult, plansResult] = await Promise.all([
      executeQuery<{ count: number }[]>('SELECT COUNT(*) as count FROM Patient WHERE doctor_id = ?', [doctorId]),
      executeQuery<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM Visit 
         WHERE doctor_id = ? AND visit_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
        [doctorId]
      ),
      executeQuery<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM NutritionPlan 
         WHERE doctor_id = ? AND status = 'active'`,
        [doctorId]
      ),
    ]);

    return {
      total: totalResult[0].count,
      visitsThisWeek: visitsResult[0].count,
      activePlans: plansResult[0].count,
    };
  },

  getWeeklyActivity: async (
    doctorId: string
  ): Promise<Array<{ day: string; visits: number; plans: number }>> => {
    const visitRows = await executeQuery<{ day: string; count: number }[]>(
      `SELECT DATE_FORMAT(visit_date, '%Y-%m-%d') as day, COUNT(*) as count FROM Visit
       WHERE doctor_id = ? AND visit_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY day ORDER BY day`,
      [doctorId]
    );
    const planRows = await executeQuery<{ day: string; count: number }[]>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as day, COUNT(*) as count FROM NutritionPlan
       WHERE doctor_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY day ORDER BY day`,
      [doctorId]
    );
    const days: Array<{ day: string; visits: number; plans: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const visits = visitRows.find((r) => r.day === key)?.count ?? 0;
      const plans = planRows.find((r) => r.day === key)?.count ?? 0;
      days.push({ day: key.slice(5), visits: Number(visits), plans: Number(plans) });
    }
    return days;
  },
};