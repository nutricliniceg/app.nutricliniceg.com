import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface SelfReportInsert {
  patientId: string;
  doctorId: string;
  messageId: string;
  weightKg: number;
  measuredAt: Date;
}

export interface SelfReportRow {
  id: string;
  patient_id: string;
  weight_kg: number | string;
  measured_at: Date;
}

export const selfReportsRepository = {
  insert: async (data: SelfReportInsert): Promise<string> => {
    const id = randomUUID();
    await executeQuery(
      'INSERT INTO PatientSelfReport (id, patient_id, doctor_id, message_id, weight_kg, measured_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.patientId, data.doctorId, data.messageId, data.weightKg, data.measuredAt]
    );
    return id;
  },

  listByPatient: async (patientId: string, doctorId: string): Promise<SelfReportRow[]> => {
    return executeQuery<SelfReportRow[]>(
      'SELECT id, patient_id, weight_kg, measured_at FROM PatientSelfReport WHERE patient_id = ? AND doctor_id = ? ORDER BY measured_at ASC',
      [patientId, doctorId]
    );
  },
};
