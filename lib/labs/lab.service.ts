import { randomUUID } from 'crypto';
import { labDraftsRepository } from '@/lib/db/repositories/lab-drafts.repo';
import { filesRepository } from '@/lib/db/repositories/files.repo';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { getAiClientForDoctor } from '@/lib/ai/client';
import { readBuffer } from '@/lib/files/store';
import type { LabAnalyzeInput } from './lab.schema';

export const labService = {
  async analyze(doctorId: string, input: LabAnalyzeInput) {
    const patient = await patientRepository.findById(input.patient_id);
    if (!patient || patient.doctor_id !== doctorId) return null;
    const ai = await getAiClientForDoctor(doctorId, { patientData: true });
    if (input.text) {
      const items = await ai.extractLabValues({ text: input.text });
      const id = randomUUID();
      await labDraftsRepository.insert({ id, patientId: input.patient_id, doctorId, source: 'text', items });
      return { draftId: id, items, source: 'text' as const };
    }
    const file = await filesRepository.findById(input.file_id as string);
    if (!file || file.owner_id !== doctorId) return null;
    const bytes = await readBuffer(file.stored_name);
    const items = await ai.extractLabValues({ imageBytes: new Uint8Array(bytes), mime: file.mime });
    const id = randomUUID();
    await labDraftsRepository.insert({ id, patientId: input.patient_id, doctorId, fileId: file.id, source: 'vision', items });
    return { draftId: id, items, source: 'vision' as const };
  },

  async listDrafts(patientId: string, doctorId: string) {
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) return null;
    return labDraftsRepository.listDraftsByPatient(patientId, doctorId);
  },

  async listApproved(patientId: string, doctorId: string) {
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) return null;
    return labDraftsRepository.listApprovedByPatient(patientId, doctorId);
  },

  async review(draftId: string, doctorId: string, status: 'approved' | 'discarded') {
    return labDraftsRepository.review(draftId, doctorId, status, doctorId);
  },
};
