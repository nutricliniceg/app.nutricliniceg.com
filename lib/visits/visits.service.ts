import { randomUUID } from 'crypto';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { calculateNutritionTargets } from '@/lib/nutrition/calc';
import type { VisitCreateInput, VisitUpdateInput } from './visits.schema';

export const visitsService = {
  async list(patientId: string, doctorId: string) {
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) return null;
    return visitsRepository.listByPatient(patientId, doctorId);
  },

  async create(doctorId: string, data: VisitCreateInput) {
    const patient = await patientRepository.findById(data.patient_id);
    if (!patient || patient.doctor_id !== doctorId) return null;
    const id = randomUUID();
    await visitsRepository.insert({
      id,
      patientId: data.patient_id,
      doctorId,
      visitDate: data.visit_date,
      weightKg: data.weight_kg ?? null,
      bodyFatPct: data.body_fat_pct ?? null,
      muscleMassKg: data.muscle_mass_kg ?? null,
      waterPct: data.water_pct ?? null,
      notes: data.notes ?? null,
    });
    if (data.weight_kg) {
      await patientRepository.updateWeight(data.patient_id, doctorId, data.weight_kg);
    }
    const recalc = await suggestRecalc(data.patient_id, doctorId);
    return { id, recalcSuggested: recalc };
  },

  async update(id: string, doctorId: string, patch: VisitUpdateInput) {
    const existing = await visitsRepository.findById(id, doctorId);
    if (!existing) return null;
    await visitsRepository.update(id, doctorId, {
      visitDate: patch.visit_date,
      weightKg: patch.weight_kg,
      bodyFatPct: patch.body_fat_pct,
      muscleMassKg: patch.muscle_mass_kg,
      waterPct: patch.water_pct,
      notes: patch.notes,
    });
    if (patch.weight_kg) {
      await patientRepository.updateWeight(existing.patient_id, doctorId, patch.weight_kg);
    }
    const recalc = await suggestRecalc(existing.patient_id, doctorId);
    return { recalcSuggested: recalc };
  },

  async remove(id: string, doctorId: string) {
    const existing = await visitsRepository.findById(id, doctorId);
    if (!existing) return false;
    await visitsRepository.remove(id, doctorId);
    return true;
  },
};

async function suggestRecalc(patientId: string, doctorId: string) {
  const patient = await patientRepository.findById(patientId);
  if (!patient || patient.doctor_id !== doctorId) return null;
  const weight = Number(patient.current_weight_kg ?? patient.initial_weight_kg);
  return calculateNutritionTargets({
    gender: patient.gender,
    birthDate: patient.birth_date instanceof Date ? patient.birth_date : new Date(patient.birth_date),
    heightCm: patient.height_cm,
    weightKg: weight,
    activityLevel: patient.activity_level,
    goal: patient.goal,
    chronicConditions: patient.chronic_conditions ?? undefined,
  });
}
