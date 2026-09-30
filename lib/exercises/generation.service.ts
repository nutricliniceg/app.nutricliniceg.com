import { randomUUID } from 'crypto';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { exercisesRepository } from '@/lib/db/repositories/exercises.repo';
import { getAiClientForDoctor } from '@/lib/ai/client';
import { sanitizeUntrusted, fencePatientData } from '@/lib/ai/sanitize';
import { MEDICAL_DISCLAIMER } from '@/lib/ai/disclaimer';
import { fail, type PatientForPlan } from '@/lib/plans';
import { exerciseAiOutputSchema, type ExerciseGenerateInput } from './exercises.schema';
import { extractYoutubeId } from './youtube';

function generationErrorCode(err: unknown): string {
  return (err as { code?: string }).code ?? 'GENERATION_FAILED';
}

export { generationErrorCode as exerciseErrorCode };

const MAX_ATTEMPTS = 3;

export const exerciseGenerationService = {
  async generate(doctorId: string, input: ExerciseGenerateInput, isAdmin: boolean): Promise<{ planId: string; status: 'pending_doctor_approval'; attempts: number; exerciseCount: number; disclaimer: string }> {
    const patient = (await patientRepository.findById(input.patient_id)) as PatientForPlan | null;
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Patient not found');
    const prefs = fencePatientData(sanitizeUntrusted(`goal=${input.goal} level=${input.level} equipment=${input.equipment ?? 'bodyweight'}`));
    const system = [
      'You are an exercise plan composer. Reply with a single valid JSON object only.',
      `Patient goal: ${input.goal}; fitness level: ${input.level}; available equipment hints: ${input.equipment ?? 'bodyweight only'}.`,
      `Build exactly ${input.days_per_week} training days (day numbers 1..${input.days_per_week}), 3-8 exercises per day.`,
      'Beginner plans use basic compound + bodyweight moves with conservative sets/reps; never prescribe maximal loads to beginners.',
      'Each exercise: {"name_ar": "<Arabic name>", "sets": 1-20, "reps": 1-500, "rest_seconds": 0-900, "youtube_url": "<optional tutorial link>"}.',
    ].join(' ');
    const ai = await getAiClientForDoctor(doctorId, { isAdmin, requestType: 'exercise_generate', patientData: true });
    let attempts = 0;
    let lastError = 'Model returned no usable days';
    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      try {
        const parsed = await ai.chatJson(
          [{ role: 'system', content: system }, { role: 'user', content: prefs }],
          exerciseAiOutputSchema,
          { requestType: 'exercise_generate', maxTokens: 4000 }
        );
        const { _disclaimer, ...output } = parsed as typeof parsed & { _disclaimer?: string };
        void _disclaimer;
        const days = output.days.filter((d) => d.day >= 1 && d.day <= input.days_per_week && d.exercises.length > 0);
        if (days.length === 0) {
          lastError = 'Model returned no usable days';
          continue;
        }
        const planId = randomUUID();
        await exercisesRepository.insertPlan({ id: planId, patientId: patient.id, doctorId, weekNumber: input.week_number ?? 1, status: 'pending_doctor_approval' });
        let count = 0;
        for (const day of days) {
          const dayId = await exercisesRepository.insertDay(planId, day.day);
          let order = 0;
          for (const ex of day.exercises) {
            const url = ex.youtube_url?.trim() || null;
            const validUrl = url && extractYoutubeId(url) ? url : null;
            await exercisesRepository.insertExercise(dayId, {
              nameAr: ex.name_ar.trim(), nameEn: ex.name_en?.trim() || null,
              sets: Math.min(20, Math.max(1, ex.sets)), reps: Math.min(500, Math.max(1, ex.reps)),
              restSeconds: ex.rest_seconds ?? null, youtubeUrl: validUrl, notes: ex.notes?.trim() || null,
            }, order);
            order += 1;
            count += 1;
          }
        }
        return { planId, status: 'pending_doctor_approval', attempts, exerciseCount: count, disclaimer: MEDICAL_DISCLAIMER };
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Generation failed';
      }
    }
    throw fail('AI_UNAVAILABLE', lastError);
  },

  async list(doctorId: string, patientId: string | null, page: number, limit: number) {
    if (patientId) {
      const patient = await patientRepository.findById(patientId);
      if (!patient || patient.doctor_id !== doctorId) return null;
    }
    return exercisesRepository.listByDoctor(doctorId, patientId, page, limit);
  },

  async get(id: string, doctorId: string) {
    return exercisesRepository.getFullPlan(id, doctorId);
  },
};
