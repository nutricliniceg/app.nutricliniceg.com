import { executeQuery } from '@/lib/db/pool';

export interface FileAsset {
  id: string;
  owner_id: string;
  patient_id: string | null;
  purpose: 'inbody' | 'lab' | 'portal_message' | 'avatar' | 'blog' | 'other';
  stored_name: string;
  original_name: string;
  mime: string;
  size_bytes: number;
  created_at: Date;
}

export interface FileInsert {
  id: string;
  ownerId: string;
  patientId?: string | null;
  purpose: FileAsset['purpose'];
  storedName: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
}

export const filesRepository = {
  insert: async (data: FileInsert): Promise<void> => {
    await executeQuery(
      `INSERT INTO FileAsset (id, owner_id, patient_id, purpose, stored_name, original_name, mime, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.ownerId, data.patientId ?? null, data.purpose, data.storedName, data.originalName, data.mime, data.sizeBytes]
    );
  },

  findById: async (id: string): Promise<FileAsset | null> => {
    const rows = await executeQuery<FileAsset[]>('SELECT * FROM FileAsset WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  },

  listByPatient: async (ownerId: string, patientId: string): Promise<FileAsset[]> => {
    return executeQuery<FileAsset[]>(
      'SELECT * FROM FileAsset WHERE owner_id = ? AND patient_id = ? ORDER BY created_at DESC',
      [ownerId, patientId]
    );
  },

  remove: async (id: string, ownerId: string): Promise<boolean> => {
    const existing = await executeQuery<FileAsset[]>('SELECT * FROM FileAsset WHERE id = ? AND owner_id = ?', [id, ownerId]);
    if (existing.length === 0) return false;
    await executeQuery('DELETE FROM FileAsset WHERE id = ?', [id]);
    return true;
  },
};
