import { executeQuery } from '@/lib/db/pool';
import type { LabItem } from '@/lib/ai/types';

export type LabDraftStatus = 'draft' | 'approved' | 'discarded';

export interface LabDraft {
  id: string;
  patient_id: string;
  doctor_id: string;
  file_id: string | null;
  source: 'vision' | 'text';
  items: LabItem[];
  status: LabDraftStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

interface LabDraftRow extends Omit<LabDraft, 'items'> {
  items: string;
}

function mapRow(row: LabDraftRow): LabDraft {
  return { ...row, items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items };
}

export const labDraftsRepository = {
  insert: async (data: { id: string; patientId: string; doctorId: string; fileId?: string | null; source: 'vision' | 'text'; items: LabItem[] }): Promise<void> => {
    await executeQuery(
      `INSERT INTO LabDraft (id, patient_id, doctor_id, file_id, source, items, status)
       VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
      [data.id, data.patientId, data.doctorId, data.fileId ?? null, data.source, JSON.stringify(data.items)]
    );
  },

  findById: async (id: string, doctorId: string): Promise<LabDraft | null> => {
    const rows = await executeQuery<LabDraftRow[]>('SELECT * FROM LabDraft WHERE id = ? AND doctor_id = ?', [id, doctorId]);
    return rows.length > 0 ? mapRow(rows[0]) : null;
  },

  listDraftsByPatient: async (patientId: string, doctorId: string): Promise<LabDraft[]> => {
    const rows = await executeQuery<LabDraftRow[]>(
      "SELECT * FROM LabDraft WHERE patient_id = ? AND doctor_id = ? AND status = 'draft' ORDER BY created_at DESC",
      [patientId, doctorId]
    );
    return rows.map(mapRow);
  },

  listApprovedByPatient: async (patientId: string, doctorId: string): Promise<LabDraft[]> => {
    const rows = await executeQuery<LabDraftRow[]>(
      "SELECT * FROM LabDraft WHERE patient_id = ? AND doctor_id = ? AND status = 'approved' ORDER BY reviewed_at DESC",
      [patientId, doctorId]
    );
    return rows.map(mapRow);
  },

  review: async (id: string, doctorId: string, status: 'approved' | 'discarded', reviewerId: string): Promise<boolean> => {
    const existing = await labDraftsRepository.findById(id, doctorId);
    if (!existing || existing.status !== 'draft') return false;
    await executeQuery("UPDATE LabDraft SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?", [status, reviewerId, id]);
    return true;
  },
};
