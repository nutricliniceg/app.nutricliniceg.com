import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface PortalTokenRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  token: string;
  permissions: string;
  notify_email: string | null;
  expires_at: Date;
  revoked: boolean | number;
  access_count: number;
  last_accessed_at: Date | null;
  created_at: Date;
}

export interface PortalTokenInsert {
  patientId: string;
  doctorId: string;
  token: string;
  permissions: unknown;
  expiresAt: Date;
  notifyEmail?: string | null;
}

export const portalTokensRepository = {
  insert: async (data: PortalTokenInsert): Promise<string> => {
    const id = randomUUID();
    await executeQuery(
      'INSERT INTO PatientPortalToken (id, patient_id, doctor_id, token, permissions, notify_email, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.patientId, data.doctorId, data.token, JSON.stringify(data.permissions), data.notifyEmail ?? null, data.expiresAt]
    );
    return id;
  },

  findByToken: async (token: string): Promise<PortalTokenRow | null> => {
    const rows = await executeQuery<PortalTokenRow[]>(
      'SELECT * FROM PatientPortalToken WHERE token = ?',
      [token]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  listByPatient: async (patientId: string, doctorId: string): Promise<PortalTokenRow[]> => {
    return executeQuery<PortalTokenRow[]>(
      'SELECT * FROM PatientPortalToken WHERE patient_id = ? AND doctor_id = ? ORDER BY created_at DESC',
      [patientId, doctorId]
    );
  },

  revoke: async (id: string, doctorId: string): Promise<boolean> => {
    const res = await executeQuery<{ affectedRows: number }>(
      'UPDATE PatientPortalToken SET revoked = TRUE WHERE id = ? AND doctor_id = ? AND revoked = FALSE',
      [id, doctorId]
    );
    return (res as unknown as { affectedRows?: number }).affectedRows !== 0;
  },

  touchAccess: async (id: string): Promise<void> => {
    await executeQuery(
      'UPDATE PatientPortalToken SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?',
      [new Date(), id]
    );
  },

  updateNotifyEmail: async (id: string, doctorId: string, email: string | null): Promise<void> => {
    await executeQuery('UPDATE PatientPortalToken SET notify_email = ? WHERE id = ? AND doctor_id = ?', [email, id, doctorId]);
  },

  // Most recent live token carrying a reply-notification address.
  findNotifyEmail: async (patientId: string, doctorId: string): Promise<string | null> => {
    const rows = await executeQuery<Array<{ notify_email: string | null }>>(
      'SELECT notify_email FROM PatientPortalToken WHERE patient_id = ? AND doctor_id = ? AND revoked = FALSE AND expires_at > ? AND notify_email IS NOT NULL ORDER BY created_at DESC LIMIT 1',
      [patientId, doctorId, new Date()]
    );
    return rows.length > 0 ? rows[0].notify_email : null;
  },
};
