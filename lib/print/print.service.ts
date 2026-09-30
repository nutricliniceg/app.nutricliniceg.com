import { userRepository } from '@/lib/db/repositories/users.repo';
import { filesRepository } from '@/lib/db/repositories/files.repo';
import { plansRepository } from '@/lib/db/repositories/plans.repo';
import { exercisesRepository } from '@/lib/db/repositories/exercises.repo';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { mintFileToken } from '@/lib/files/signed-url';
import { fail } from '@/lib/plans';
import { resolveBrand, type BrandView } from './branding';
import { toNutritionPrintView, toExercisePrintView, type NutritionPrintView, type ExercisePrintView } from './views';
import { verifyPrintKey, mintPrintKey } from './print-links';
import type { BrandingUpdateInput } from './print.schema';

function mintFor(ownerId: string): (fileId: string) => string {
  return (fileId: string) => `/api/files/${fileId}?token=${mintFileToken(fileId, ownerId)}`;
}

async function brandFor(doctorId: string): Promise<{ brand: BrandView; doctorId: string }> {
  const doctor = await userRepository.findById(doctorId);
  if (!doctor) throw fail('NOT_FOUND', 'Doctor not found');
  return { brand: resolveBrand(doctor, mintFor(doctorId)), doctorId };
}

export const brandingService = {
  async get(doctorId: string) {
    const doctor = await userRepository.findById(doctorId);
    if (!doctor) return null;
    return {
      clinic_name: doctor.clinic_name,
      clinic_logo_url: doctor.clinic_logo_url,
      display: resolveBrand(doctor, mintFor(doctorId)),
    };
  },

  async update(doctorId: string, input: BrandingUpdateInput) {
    const doctor = await userRepository.findById(doctorId);
    if (!doctor) throw fail('NOT_FOUND', 'Doctor not found');
    const patch: { clinic_name?: string | null; clinic_logo_url?: string | null } = {};
    if (input.clinic_name !== undefined) patch.clinic_name = input.clinic_name?.trim() || null;
    if (input.clinic_logo_file_id !== undefined) {
      if (input.clinic_logo_file_id === null) {
        patch.clinic_logo_url = null;
      } else {
        const file = await filesRepository.findById(input.clinic_logo_file_id);
        if (!file || file.owner_id !== doctorId) throw fail('NOT_FOUND', 'Logo file not found');
        if (!file.mime.startsWith('image/')) throw fail('INVALID_LOGO', 'Clinic logo must be an image');
        patch.clinic_logo_url = `file:${file.id}`;
      }
    }
    await userRepository.update(doctorId, patch);
    return brandingService.get(doctorId);
  },
};

export interface PrintAuth {
  doctorId: string;
}

// Cookie session OR short-lived signed share link. One generic NOT_FOUND
// for foreign/missing/expired (anti-enumeration).
async function authorizeNutrition(planId: string, sessionDoctorId: string | null, key?: string): Promise<PrintAuth> {
  if (sessionDoctorId) {
    const plan = await plansRepository.findOwnedById(planId, sessionDoctorId);
    if (!plan) throw fail('NOT_FOUND', 'Not found');
    return { doctorId: sessionDoctorId };
  }
  if (key) {
    const verified = verifyPrintKey(key);
    if (!verified || verified.planType !== 'nutrition' || verified.planId !== planId) throw fail('NOT_FOUND', 'Not found');
    const rows = await plansRepository.findByIdPublic(planId);
    if (!rows) throw fail('NOT_FOUND', 'Not found');
    return { doctorId: rows.doctor_id };
  }
  throw fail('NOT_FOUND', 'Not found');
}

async function authorizeExercise(planId: string, sessionDoctorId: string | null, key?: string): Promise<PrintAuth> {
  if (sessionDoctorId) {
    const plan = await exercisesRepository.findOwnedById(planId, sessionDoctorId);
    if (!plan) throw fail('NOT_FOUND', 'Not found');
    return { doctorId: sessionDoctorId };
  }
  if (key) {
    const verified = verifyPrintKey(key);
    if (!verified || verified.planType !== 'exercise' || verified.planId !== planId) throw fail('NOT_FOUND', 'Not found');
    const full = await exercisesRepository.findPublicById(planId);
    if (!full) throw fail('NOT_FOUND', 'Not found');
    return { doctorId: full.doctor_id };
  }
  throw fail('NOT_FOUND', 'Not found');
}

export const printService = {
  async nutrition(planId: string, sessionDoctorId: string | null, key?: string): Promise<NutritionPrintView> {
    const { doctorId } = await authorizeNutrition(planId, sessionDoctorId, key);
    // Server-persisted rows only: rails/reconciled values cannot be
    // overridden through print (no value inputs exist on this path).
    const full = await plansRepository.getFullPlan(planId, doctorId);
    if (!full) throw fail('NOT_FOUND', 'Not found');
    const p = full.plan as {
      patient_id: string; target_calories: number; target_protein_g: number;
      target_carbs_g: number; target_fats_g: number; show_calories_to_patient?: boolean | number | null;
    };
    const patient = await patientRepository.findById(String(p.patient_id));
    const { brand } = await brandFor(doctorId);
    // Q2 (owner decision pending): per-plan calorie visibility, default true.
    const showCalories = p.show_calories_to_patient == null ? true : p.show_calories_to_patient === true || p.show_calories_to_patient === 1;
    return toNutritionPrintView(
      full.meals.map((m) => ({
        day: Number(m.meal.day_of_week),
        mealName: String(m.meal.meal_name),
        items: m.items.map((i) => ({
          nameAr: i.food_name_ar, nameEn: i.food_name_en,
          grams: Number(i.grams), proteinG: Number(i.protein_g), carbsG: Number(i.carbs_g),
          fatsG: Number(i.fats_g), calories: Number(i.calories),
        })),
      })),
      {
        brand,
        patientName: patient ? (patient as { name_ar: string }).name_ar : '',
        targets: {
          calories: Number(p.target_calories), proteinG: Number(p.target_protein_g),
          carbsG: Number(p.target_carbs_g), fatsG: Number(p.target_fats_g),
        },
        showCalories,
      }
    );
  },

  async exercise(planId: string, sessionDoctorId: string | null, key?: string): Promise<ExercisePrintView> {
    const { doctorId } = await authorizeExercise(planId, sessionDoctorId, key);
    const full = await exercisesRepository.getFullPlan(planId, doctorId);
    if (!full) throw fail('NOT_FOUND', 'Not found');
    const patient = await patientRepository.findById(String((full.plan as { patient_id: string }).patient_id));
    const { brand } = await brandFor(doctorId);
    return toExercisePrintView(
      full.days.map((d) => ({
        day: Number(d.day.day_of_week),
        exercises: d.exercises.map((e) => ({
          nameAr: e.name_ar, nameEn: e.name_en, sets: Number(e.sets), reps: Number(e.reps),
          restSeconds: e.rest_seconds == null ? null : Number(e.rest_seconds),
          notes: (e as { notes?: string | null }).notes ?? null, youtubeUrl: e.youtube_url,
        })),
      })),
      { brand, patientName: patient ? (patient as { name_ar: string }).name_ar : '' }
    );
  },

  async mintLink(doctorId: string, planType: 'nutrition' | 'exercise', planId: string): Promise<{ url: string }> {
    if (planType === 'nutrition') {
      const plan = await plansRepository.findOwnedById(planId, doctorId);
      if (!plan) throw fail('NOT_FOUND', 'Not found');
      return { url: `/print/nutrition/${planId}?key=${mintPrintKey(planType, planId)}` };
    }
    const plan = await exercisesRepository.findOwnedById(planId, doctorId);
    if (!plan) throw fail('NOT_FOUND', 'Not found');
    return { url: `/print/exercise/${planId}?key=${mintPrintKey(planType, planId)}` };
  },
};
