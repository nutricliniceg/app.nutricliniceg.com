import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';
import { selfReportsRepository } from '@/lib/db/repositories/self-reports.repo';
import { labDraftsRepository } from '@/lib/db/repositories/lab-drafts.repo';
import { calculateNutritionTargets, calculateAge } from '@/lib/nutrition/calc';
import { getAiClientForDoctor } from '@/lib/ai/client';
import { MEDICAL_DISCLAIMER } from '@/lib/ai/disclaimer';
import type {
  PatientCreateInput,
  PatientUpdateInput,
  PatientListQuery,
} from './patients.schema';

function toBirthDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function toWeight(p: { current_weight_kg: number | null; initial_weight_kg: number }): number {
  return Number(p.current_weight_kg ?? p.initial_weight_kg);
}

export const patientsService = {
  async list(doctorId: string, query: PatientListQuery) {
    return patientRepository.findByDoctor(doctorId, query);
  },

  async create(doctorId: string, data: PatientCreateInput) {
    return patientRepository.create(doctorId, data);
  },

  async getWithNutrition(id: string, doctorId: string) {
    const patient = await patientRepository.findById(id);
    if (!patient || patient.doctor_id !== doctorId) return null;
    const nutrition = calculateNutritionTargets({
      gender: patient.gender,
      birthDate: toBirthDate(patient.birth_date),
      heightCm: patient.height_cm,
      weightKg: toWeight(patient),
      activityLevel: patient.activity_level,
      goal: patient.goal,
      chronicConditions: patient.chronic_conditions ?? undefined,
    });
    const visits = await visitsRepository.listByPatient(id, doctorId);
    const labApproved = await labDraftsRepository.listApprovedByPatient(id, doctorId);
    // P20: patient self-reported weights ride along (source-tagged) so
    // charts can overlay them; clinical Visit rows stay authoritative.
    const selfReports = await selfReportsRepository.listByPatient(id, doctorId);
    return { patient, nutrition, visits, labApproved, selfReports };
  },

  async update(id: string, doctorId: string, data: PatientUpdateInput) {
    const patient = await patientRepository.findById(id);
    if (!patient || patient.doctor_id !== doctorId) return false;
    await patientRepository.update(id, doctorId, data);
    return true;
  },

  async remove(id: string, doctorId: string) {
    const patient = await patientRepository.findById(id);
    if (!patient || patient.doctor_id !== doctorId) return null;
    await patientRepository.delete(id, doctorId);
    return patient;
  },

  async recalculate(id: string, doctorId: string, patch: { weight_kg?: number; height_cm?: number }) {
    const patient = await patientRepository.findById(id);
    if (!patient || patient.doctor_id !== doctorId) return null;
    if (patch.weight_kg) await patientRepository.updateWeight(id, doctorId, patch.weight_kg);
    if (patch.height_cm) await patientRepository.update(id, doctorId, { height_cm: patch.height_cm });
    const updated = await patientRepository.findById(id);
    if (!updated) return null;
    return calculateNutritionTargets({
      gender: updated.gender,
      birthDate: toBirthDate(updated.birth_date),
      heightCm: updated.height_cm,
      weightKg: toWeight(updated),
      activityLevel: updated.activity_level,
      goal: updated.goal,
      chronicConditions: updated.chronic_conditions ?? undefined,
    });
  },

  async dashboardStats(doctorId: string) {
    const stats = await patientRepository.getStats(doctorId);
    const weekly = await patientRepository.getWeeklyActivity(doctorId);
    return { ...stats, weekly };
  },

  // DASH-12: anonymized summary (CMP-03/11 — no name/phone/address leaves the server).
  async summarize(id: string, doctorId: string) {
    const patient = await patientRepository.findById(id);
    if (!patient || patient.doctor_id !== doctorId) return null;
    const visits = await visitsRepository.listByPatient(id, doctorId);
    const selfReports = await selfReportsRepository.listByPatient(id, doctorId);
    const weights = visits.map((v) => Number(v.weight_kg)).filter((w) => Number.isFinite(w) && w > 0);
    for (const r of selfReports) {
      const w = Number(r.weight_kg);
      if (Number.isFinite(w) && w > 0) weights.push(w);
    }
    const current = Number(patient.current_weight_kg ?? patient.initial_weight_kg);
    if (weights.length === 0) weights.push(current);
    const age = calculateAge(patient.birth_date instanceof Date ? patient.birth_date : new Date(patient.birth_date));
    const summary = await (await getAiClientForDoctor(doctorId, { patientData: true })).summarizePatient({
      age,
      gender: patient.gender,
      bmi: calculateNutritionTargets({
        gender: patient.gender,
        birthDate: toBirthDate(patient.birth_date),
        heightCm: patient.height_cm,
        weightKg: current,
        activityLevel: patient.activity_level,
        goal: patient.goal,
      }).bmi,
      currentWeightKg: current,
      weightTrendKg: weights.slice().reverse().slice(0, 12),
      goal: patient.goal,
      activityLevel: patient.activity_level,
      chronicFlags: patient.chronic_conditions ?? [],
    });
    return { summary, disclaimer: MEDICAL_DISCLAIMER };
  },
};
