import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

// Minimal PatientMessage access for the portal (P19). The full thread
// model (read receipts, archive, delete window) lands in P20, which
// extends this module — it does not replace it.
export type PortalMessageType = 'text' | 'image' | 'weight_log' | 'measurement_log' | 'note';

export interface PortalMessageInsert {
  patientId: string;
  doctorId: string;
  senderType: 'patient' | 'doctor';
  messageType: PortalMessageType;
  messageText: string | null;
  attachmentUrl?: string | null;
  payload: unknown;
}

export interface PortalMessageRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  sender_type: 'patient' | 'doctor';
  message_type: string;
  message_text: string | null;
  attachment_url: string | null;
  payload_json: string | null;
  is_read: boolean | number;
  read_at: Date | null;
  archived: boolean | number;
  created_at: Date;
}

export interface ThreadSummaryRow {
  patient_id: string;
  patient_name: string;
  last_message_at: Date;
  last_preview: string | null;
  last_sender: 'patient' | 'doctor';
  unread_count: number;
  total_count: number;
}

export const messagesRepository = {
  insert: async (data: PortalMessageInsert): Promise<string> => {
    const id = randomUUID();
    await executeQuery(
      'INSERT INTO PatientMessage (id, patient_id, doctor_id, sender_type, message_type, message_text, attachment_url, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.patientId, data.doctorId, data.senderType, data.messageType, data.messageText, data.attachmentUrl ?? null, JSON.stringify(data.payload ?? null)]
    );
    return id;
  },

  listThread: async (patientId: string, doctorId: string, limit = 50): Promise<PortalMessageRow[]> => {
    return executeQuery<PortalMessageRow[]>(
      'SELECT id, patient_id, doctor_id, sender_type, message_type, message_text, attachment_url, payload_json, is_read, read_at, archived, created_at FROM PatientMessage WHERE patient_id = ? AND doctor_id = ? ORDER BY created_at DESC LIMIT ?',
      [patientId, doctorId, limit]
    );
  },

  findById: async (id: string): Promise<PortalMessageRow | null> => {
    const rows = await executeQuery<PortalMessageRow[]>(
      'SELECT id, patient_id, doctor_id, sender_type, message_type, message_text, attachment_url, payload_json, is_read, read_at, archived, created_at FROM PatientMessage WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  // Central inbox: one row per patient thread with unread badge counts.
  // Archived threads excluded unless requested. Cheap indexed query for
  // the 60s poller (MSG-03).
  listThreads: async (doctorId: string, includeArchived = false): Promise<ThreadSummaryRow[]> => {
    const base = `SELECT m.patient_id, p.name_ar AS patient_name, MAX(m.created_at) AS last_message_at,
        SUBSTRING((SELECT m2.message_text FROM PatientMessage m2 WHERE m2.patient_id = m.patient_id AND m2.doctor_id = m.doctor_id ORDER BY m2.created_at DESC LIMIT 1), 1, 140) AS last_preview,
        (SELECT m3.sender_type FROM PatientMessage m3 WHERE m3.patient_id = m.patient_id AND m3.doctor_id = m.doctor_id ORDER BY m3.created_at DESC LIMIT 1) AS last_sender,
        SUM(CASE WHEN m.sender_type = 'patient' AND m.is_read = FALSE THEN 1 ELSE 0 END) AS unread_count,
        COUNT(*) AS total_count
       FROM PatientMessage m INNER JOIN Patient p ON p.id = m.patient_id
       WHERE m.doctor_id = ?`;
    const tail = ' GROUP BY m.patient_id, p.name_ar ORDER BY last_message_at DESC';
    // No interpolation of values: two fixed query shapes, ? placeholders only.
    if (includeArchived) {
      return executeQuery<ThreadSummaryRow[]>(base + tail, [doctorId]);
    }
    return executeQuery<ThreadSummaryRow[]>(
      base + ' AND m.archived = FALSE' + tail,
      [doctorId]
    );
  },

  unreadSummary: async (doctorId: string): Promise<{ total_unread: number; threads: Array<{ patient_id: string; unread_count: number; last_preview: string | null }> }> => {
    const rows = await executeQuery<Array<{ patient_id: string; unread_count: number | string; last_preview: string | null }>>(
      `SELECT m.patient_id,
        SUM(CASE WHEN m.sender_type = 'patient' AND m.is_read = FALSE THEN 1 ELSE 0 END) AS unread_count,
        SUBSTRING((SELECT m2.message_text FROM PatientMessage m2 WHERE m2.patient_id = m.patient_id AND m2.doctor_id = m.doctor_id AND m2.archived = FALSE ORDER BY m2.created_at DESC LIMIT 1), 1, 140) AS last_preview
       FROM PatientMessage m WHERE m.doctor_id = ? AND m.archived = FALSE
       GROUP BY m.patient_id`,
      [doctorId]
    );
    const threads = rows.map((r) => ({ patient_id: r.patient_id, unread_count: Number(r.unread_count), last_preview: r.last_preview }));
    return { total_unread: threads.reduce((s, t) => s + t.unread_count, 0), threads };
  },

  markThreadRead: async (patientId: string, doctorId: string): Promise<void> => {
    await executeQuery(
      "UPDATE PatientMessage SET is_read = TRUE, read_at = ? WHERE patient_id = ? AND doctor_id = ? AND sender_type = 'patient' AND is_read = FALSE",
      [new Date(), patientId, doctorId]
    );
  },

  deleteById: async (id: string): Promise<void> => {
    await executeQuery('DELETE FROM PatientMessage WHERE id = ?', [id]);
  },

  setThreadArchived: async (patientId: string, doctorId: string, archived: boolean): Promise<void> => {
    await executeQuery('UPDATE PatientMessage SET archived = ? WHERE patient_id = ? AND doctor_id = ?', [archived, patientId, doctorId]);
  },
};
