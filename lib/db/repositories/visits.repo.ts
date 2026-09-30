import { executeQuery } from '@/lib/db/pool';
import { encryptField, decryptField } from '@/lib/security/field-crypto';

export interface Visit {
  id: string;
  patient_id: string;
  doctor_id: string;
  visit_date: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
  water_pct: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface VisitInsert {
  id: string;
  patientId: string;
  doctorId: string;
  visitDate: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  muscleMassKg?: number | null;
  waterPct?: number | null;
  notes?: string | null;
}

export interface VisitPatch {
  visitDate?: string;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  muscleMassKg?: number | null;
  waterPct?: number | null;
  notes?: string | null;
}

const VISIT_SELECT =
  'SELECT id, patient_id, doctor_id, visit_date, weight_kg, body_fat_pct, muscle_mass_kg, water_pct, notes, created_at, updated_at';

export const visitsRepository = {
  insert: async (data: VisitInsert): Promise<void> => {
    await executeQuery(
      `INSERT INTO Visit (id, patient_id, doctor_id, visit_date, weight_kg, body_fat_pct, muscle_mass_kg, water_pct, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.patientId, data.doctorId, data.visitDate, data.weightKg ?? null, data.bodyFatPct ?? null, data.muscleMassKg ?? null, data.waterPct ?? null, encryptField(data.notes ?? null)]
    );
  },

  // CMP-07: notes are decrypted on read; legacy plaintext rows (written
  // before P30) pass through and are re-encrypted on the next update.
  findById: async (id: string, doctorId: string): Promise<Visit | null> => {
    const rows = await executeQuery<Visit[]>(VISIT_SELECT + ' FROM Visit WHERE id = ? AND doctor_id = ?', [id, doctorId]);
    if (rows.length === 0) return null;
    return { ...rows[0], notes: decryptField(rows[0].notes) };
  },

  listByPatient: async (patientId: string, doctorId: string): Promise<Visit[]> => {
    const rows = await executeQuery<Visit[]>(
      VISIT_SELECT + ' FROM Visit WHERE patient_id = ? AND doctor_id = ? ORDER BY visit_date DESC, created_at DESC',
      [patientId, doctorId]
    );
    return rows.map((r) => ({ ...r, notes: decryptField(r.notes) }));
  },

  update: async (id: string, doctorId: string, patch: VisitPatch): Promise<boolean> => {
    const map: Record<keyof VisitPatch, string> = {
      visitDate: 'visit_date',
      weightKg: 'weight_kg',
      bodyFatPct: 'body_fat_pct',
      muscleMassKg: 'muscle_mass_kg',
      waterPct: 'water_pct',
      notes: 'notes',
    };
    const fields: string[] = [];
    const values: Array<string | number | Date | null> = [];
    for (const [key, value] of Object.entries(patch) as Array<[keyof VisitPatch, string | number | null | undefined]>) {
      if (value !== undefined && map[key]) {
        fields.push(`${map[key]} = ?`);
        // CMP-07: notes are always (re-)encrypted on write, which also
        // migrates legacy plaintext rows to ciphertext transparently.
        values.push(key === 'notes' ? encryptField(value as string | null) : value);
      }
    }
    if (fields.length === 0) return true;
    values.push(id, doctorId);
    const res = await executeQuery<{ affectedRows: number }>(
      // eslint-disable-next-line no-restricted-syntax -- SET columns come from a fixed map; values use ? placeholders (D-01)
      `UPDATE Visit SET ${fields.join(', ')} WHERE id = ? AND doctor_id = ?`,
      values
    );
    return (res as unknown as { affectedRows?: number }).affectedRows !== 0;
  },

  remove: async (id: string, doctorId: string): Promise<boolean> => {
    await executeQuery('DELETE FROM Visit WHERE id = ? AND doctor_id = ?', [id, doctorId]);
    return true;
  },
};
