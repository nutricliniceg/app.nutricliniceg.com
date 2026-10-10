import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { filesRepository } from '@/lib/db/repositories/files.repo';
import { aiConversationsRepository } from '@/lib/db/repositories/ai-conversations.repo';
import { getAiClientForDoctor } from '@/lib/ai/client';
import { MEDICAL_DISCLAIMER } from '@/lib/ai/disclaimer';
import { sanitizeUntrusted, fencePatientData } from '@/lib/ai/sanitize';
import { labService } from '@/lib/labs';
import { readBuffer } from '@/lib/files/store';
import { fail } from '@/lib/plans';
import { assembleContext, retentionFlags } from './context';
import type { ConversationSendInput } from './assistant.schema';

const BASE_SYSTEM = [
  'You are a nutrition clinical assistant for Egyptian doctors (Arabic-first).',
  'You give suggestive guidance only — never a diagnosis, never a prescription.',
  'Every answer must end with a reminder that the doctor must review before acting.',
  'When patient context is provided, use it; cite source files by name where relevant.',
].join(' ');

const TRASH_DAYS = 30;

function autoTitle(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length <= 60 ? flat : `${flat.slice(0, 57)}…`;
}

export const assistantService = {
  async list(doctorId: string, filters: { q?: string; archived?: boolean; patientId?: string | null; trash?: boolean }) {
    const rows = await aiConversationsRepository.list(doctorId, {
      q: filters.q, archived: filters.archived, patientId: filters.patientId, trash: filters.trash,
    });
    return rows.map((r) => ({
      id: r.id, title: r.title, patient_id: r.patient_id,
      is_pinned: r.is_pinned === true || r.is_pinned === 1,
      is_archived: r.is_archived === true || r.is_archived === 1,
      deleted_at: r.deleted_at, created_at: r.created_at, updated_at: r.updated_at,
    }));
  },

  async create(doctorId: string, title: string | null, patientId: string | null) {
    if (patientId) {
      const patient = await patientRepository.findById(patientId);
      if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Patient not found');
    }
    const id = await aiConversationsRepository.insert(doctorId, title?.trim() || null);
    if (patientId) await aiConversationsRepository.update(id, doctorId, { patientId });
    return { id };
  },

  async get(doctorId: string, id: string) {
    const conv = await aiConversationsRepository.findOwned(id, doctorId);
    if (!conv || conv.deleted_at) throw fail('NOT_FOUND', 'Conversation not found');
    const messages = await aiConversationsRepository.listMessages(id, doctorId);
    const patient = conv.patient_id ? await patientRepository.findById(conv.patient_id) : null;
    return {
      conversation: conv,
      patient: patient ? { id: patient.id, name_ar: (patient as { name_ar: string }).name_ar } : null,
      messages: messages.filter((m) => m.role !== 'system').map((m) => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at })),
    };
  },

  async patch(doctorId: string, id: string, patch: { title?: string; isPinned?: boolean; isArchived?: boolean }) {
    const conv = await aiConversationsRepository.findOwned(id, doctorId);
    if (!conv || conv.deleted_at) throw fail('NOT_FOUND', 'Conversation not found');
    await aiConversationsRepository.update(id, doctorId, {
      title: patch.title, isPinned: patch.isPinned, isArchived: patch.isArchived,
    });
    return { id };
  },

  async remove(doctorId: string, id: string): Promise<void> {
    const conv = await aiConversationsRepository.findOwned(id, doctorId);
    if (!conv || conv.deleted_at) throw fail('NOT_FOUND', 'Conversation not found');
    await aiConversationsRepository.softDelete(id, doctorId);
  },

  async restore(doctorId: string, id: string): Promise<void> {
    const conv = await aiConversationsRepository.findOwned(id, doctorId);
    if (!conv || !conv.deleted_at) throw fail('NOT_FOUND', 'Conversation not found');
    if (Date.now() - new Date(conv.deleted_at).getTime() > TRASH_DAYS * 24 * 60 * 60 * 1000) {
      throw fail('TRASH_EXPIRED', 'Conversations are restorable within 30 days only');
    }
    await aiConversationsRepository.restore(id, doctorId);
  },

  async linkPatient(doctorId: string, id: string, patientId: string, confirmed = false) {
    const conv = await aiConversationsRepository.findOwned(id, doctorId);
    if (!conv || conv.deleted_at) throw fail('NOT_FOUND', 'Conversation not found');
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Patient not found');
    // AI-26/27: mixing patients in one thread risks data bleed — linking a
    // different patient over existing history needs explicit confirmation.
    const prior = conv.patient_id;
    if (prior && prior !== patientId) {
      const history = await aiConversationsRepository.listMessages(id, doctorId);
      const hasHistory = history.some((m) => m.role !== 'system');
      if (hasHistory && !confirmed) {
        throw fail('NEEDS_CONFIRMATION', 'This conversation already holds another patient’s context — start a new conversation to avoid data mixing, or confirm the switch', { prior_patient_id: prior });
      }
    }
    await aiConversationsRepository.update(id, doctorId, { patientId });
    return { id, patient_id: patientId };
  },

  async unlinkPatient(doctorId: string, id: string) {
    const conv = await aiConversationsRepository.findOwned(id, doctorId);
    if (!conv || conv.deleted_at) throw fail('NOT_FOUND', 'Conversation not found');
    await aiConversationsRepository.update(id, doctorId, { patientId: null });
    return { id };
  },

  async captureConsent(doctorId: string, patientId: string) {
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Patient not found');
    await patientRepository.setConsentAiSharing(patientId, doctorId);
    return { patient_id: patientId };
  },

  async lastPayload(doctorId: string, id: string) {
    const conv = await aiConversationsRepository.findOwned(id, doctorId);
    if (!conv || conv.deleted_at) throw fail('NOT_FOUND', 'Conversation not found');
    const system = await aiConversationsRepository.lastSystemMessage(id, doctorId);
    const retention = await retentionFlags();
    return { outbound: system?.content ?? null, retention, disclaimer: MEDICAL_DISCLAIMER };
  },

  async exportMarkdown(doctorId: string, id: string): Promise<{ filename: string; markdown: string }> {
    const full = await assistantService.get(doctorId, id);
    const lines = [`# ${full.conversation.title ?? 'Conversation'}`, '', ...full.messages.flatMap((m) => [`## ${m.role}`, '', m.content, ''])];
    lines.push('---', '', `_${MEDICAL_DISCLAIMER}_`);
    const safe = (full.conversation.title ?? 'conversation').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60);
    return { filename: `${safe || 'conversation'}.md`, markdown: lines.join('\n') };
  },

  async send(doctorId: string, isAdmin: boolean, id: string, input: ConversationSendInput) {
    const conv = await aiConversationsRepository.findOwned(id, doctorId);
    if (!conv || conv.deleted_at) throw fail('NOT_FOUND', 'Conversation not found');
    const ai = await getAiClientForDoctor(doctorId, { isAdmin, requestType: 'assistant_chat', patientData: Boolean(conv.patient_id) });
    const history = await aiConversationsRepository.listMessages(id, doctorId);
    const modelHistory = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    let systemExtra = '';
    let patientId: string | null = conv.patient_id;
    if (patientId) {
      // Consent gate lives inside assembleContext (CONSENT_REQUIRED).
      const ctx = await assembleContext(doctorId, patientId);
      systemExtra = ctx.systemBlock;
    }
    // AI-23 attachments: owned files only; images via vision, others noted.
    const visionNotes: string[] = [];
    for (const fileId of input.file_ids ?? []) {
      const file = await filesRepository.findById(fileId);
      if (!file || file.owner_id !== doctorId) throw fail('NOT_FOUND', 'Attachment not found');
      if (file.mime.startsWith('image/')) {
        const bytes = await readBuffer(file.stored_name);
        const seen = await ai.vision(new Uint8Array(bytes), `Describe clinically relevant content of ${file.original_name} in 3-6 lines.`, { mime: file.mime, requestType: 'assistant_vision', maxTokens: 600 });
        visionNotes.push(`File "${file.original_name}": ${seen.text}`);
      } else {
        visionNotes.push(`File "${file.original_name}" (${file.mime}) attached — values should be extracted via the lab analyzer, not assumed.`);
      }
    }
    const systemContent = [BASE_SYSTEM, systemExtra, visionNotes.length > 0 ? fencePatientData(sanitizeUntrusted(visionNotes.join('\n'))) : '']
      .filter(Boolean)
      .join('\n\n');
    const outbound = [
      { role: 'system', content: systemContent },
      ...modelHistory,
      { role: 'user', content: input.content },
    ] as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    const result = await ai.chat(outbound, { requestType: 'assistant_chat', maxTokens: 2000 });
    await aiConversationsRepository.insertMessage(id, 'system', systemContent, { outbound: true, patient_id: patientId });
    await aiConversationsRepository.insertMessage(id, 'user', input.content, input.file_ids ? { file_ids: input.file_ids } : undefined);
    const assistantId = await aiConversationsRepository.insertMessage(id, 'assistant', result.text);
    if (!conv.title) {
      await aiConversationsRepository.update(id, doctorId, { title: autoTitle(input.content) });
    }
    return {
      messageId: assistantId,
      reply: result.text,
      disclaimer: MEDICAL_DISCLAIMER,
      outbound,
      retention: await retentionFlags(),
    };
  },

  async analyzeLab(doctorId: string, patientId: string, text: string | null, fileId: string | null) {
    const result = await labService.analyze(doctorId, { patient_id: patientId, text: text ?? undefined, file_id: fileId ?? undefined });
    if (!result) throw fail('NOT_FOUND', 'Patient or file not found');
    return result;
  },
};
