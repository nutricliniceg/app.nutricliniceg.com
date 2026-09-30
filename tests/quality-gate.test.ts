import { describe, it, expect, vi, beforeEach } from 'vitest';
import { brandingService, printService } from '@/lib/print/print.service';
import { templatesService } from '@/lib/templates/templates.service';
import { exerciseEditorService } from '@/lib/exercises/editor.service';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { filesRepository } from '@/lib/db/repositories/files.repo';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { plansRepository, planRevisionsRepository } from '@/lib/db/repositories/plans.repo';
import { templatesRepository } from '@/lib/db/repositories/templates.repo';
import { exercisesRepository } from '@/lib/db/repositories/exercises.repo';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';

vi.mock('@/lib/db/repositories/settings.repo', () => ({
  settingsRepository: { get: vi.fn().mockResolvedValue(null), set: vi.fn() },
}));

vi.mock('@/lib/db/repositories/users.repo', () => ({
  userRepository: { findById: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/lib/db/repositories/files.repo', () => ({
  filesRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/db/repositories/patients.repo', () => ({
  patientRepository: { findById: vi.fn() },
}));

vi.mock('@/lib/db/repositories/visits.repo', () => ({
  visitsRepository: { listByPatient: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/foods.repo', () => ({
  foodsRepository: { findByIds: vi.fn().mockResolvedValue([]), findById: vi.fn(), listCandidates: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/db/repositories/plans.repo', () => ({
  plansRepository: {
    findById: vi.fn(), findOwnedById: vi.fn(), findByIdPublic: vi.fn(),
    insertPlan: vi.fn().mockResolvedValue(undefined), insertMeal: vi.fn().mockResolvedValue(undefined),
    insertMealItem: vi.fn().mockResolvedValue(undefined), listByPatient: vi.fn().mockResolvedValue([]),
    getFullPlan: vi.fn(), updateShowCalories: vi.fn(),
  },
  planRevisionsRepository: {
    nextRevisionNo: vi.fn().mockResolvedValue(1), insert: vi.fn().mockResolvedValue(undefined),
    listByPlan: vi.fn().mockResolvedValue([]), getByNo: vi.fn(),
  },
  planGenerationsRepository: { insert: vi.fn(), findByPlan: vi.fn() },
}));

vi.mock('@/lib/db/repositories/templates.repo', () => ({
  templatesRepository: {
    insert: vi.fn(), findVisibleById: vi.fn(), listVisible: vi.fn(),
    incrementUsage: vi.fn(), deleteById: vi.fn(), updateById: vi.fn(),
  },
}));

vi.mock('@/lib/db/repositories/exercises.repo', () => ({
  exercisesRepository: {
    insertPlan: vi.fn().mockResolvedValue(undefined), findOwnedById: vi.fn(), findPublicById: vi.fn(),
    listByPatient: vi.fn().mockResolvedValue([]), updateStatus: vi.fn(),
    deleteDaysByPlan: vi.fn(), insertDay: vi.fn(), insertExercise: vi.fn(),
    updateExercise: vi.fn(), getFullPlan: vi.fn(),
  },
}));

type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FILE_URL_SECRET = 'test-file-url-secret-16';
});

describe('QATE branding update guards', () => {
  it('rejects foreign files and non-images, trims names', async () => {
    (userRepository.findById as Mock).mockResolvedValue({ id: 'doc1', name: 'd', clinic_name: null, clinic_logo_url: null });
    (filesRepository.findById as Mock).mockResolvedValue({ id: 'f1', owner_id: 'other', mime: 'image/png' });
    await expect(brandingService.update('doc1', { clinic_logo_file_id: 'f1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    (filesRepository.findById as Mock).mockResolvedValue({ id: 'f1', owner_id: 'doc1', mime: 'application/pdf' });
    await expect(brandingService.update('doc1', { clinic_logo_file_id: 'f1' })).rejects.toMatchObject({ code: 'INVALID_LOGO' });
    (filesRepository.findById as Mock).mockResolvedValue({ id: 'f1', owner_id: 'doc1', mime: 'image/webp' });
    await brandingService.update('doc1', { clinic_name: '  عيادة  ', clinic_logo_file_id: 'f1' });
    expect(userRepository.update as Mock).toHaveBeenCalledWith('doc1', { clinic_name: 'عيادة', clinic_logo_url: 'file:f1' });
  });
});

describe('QATE print auth uniformity', () => {
  const full = {
    plan: { patient_id: 'pat1', target_calories: 1400, target_protein_g: 80, target_carbs_g: 150, target_fats_g: 45 },
    meals: [],
  };
  it('cookie owner, share key, and failures share one generic 404', async () => {
    (plansRepository.findOwnedById as Mock).mockResolvedValue({ id: 'p1' });
    (plansRepository.getFullPlan as Mock).mockResolvedValue(full);
    (patientRepository.findById as Mock).mockResolvedValue({ name_ar: 'م' });
    (userRepository.findById as Mock).mockResolvedValue({ name: 'd', clinic_name: null, clinic_logo_url: null });
    await expect(printService.nutrition('p1', 'doc1')).resolves.toMatchObject({ patientName: 'م' });
    (plansRepository.findByIdPublic as Mock).mockResolvedValue({ id: 'p1', doctor_id: 'doc9' });
    const { mintPrintKey } = await import('@/lib/print/print-links');
    await expect(printService.nutrition('p1', null, mintPrintKey('nutrition', 'p1'))).resolves.toMatchObject({ patientName: 'م' });
    await expect(printService.nutrition('p1', null, mintPrintKey('exercise', 'p1'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(printService.nutrition('p1', null, 'garbage')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(printService.nutrition('p1', null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('QATE template management RBAC', () => {
  it('blocks non-admin global create/edit/archive, allows owners', async () => {
    await expect(templatesService.createFromPlan('doc1', false, { plan_id: '00000000-0000-4000-8000-000000000000', name: 't', category: 'diet', is_global: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    (templatesRepository.findVisibleById as Mock).mockResolvedValue({ id: 'g1', is_global: 1, owner_id: null });
    await expect(templatesService.updateTemplate('doc1', false, 'g1', { name: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(templatesService.removeTemplate('doc1', false, 'g1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    (templatesRepository.findVisibleById as Mock).mockResolvedValue({ id: 't1', is_global: 0, owner_id: 'doc1' });
    await templatesService.updateTemplate('doc1', false, 't1', { name: 'New' });
    expect(templatesRepository.updateById as Mock).toHaveBeenCalledWith('t1', { name: 'New' });
    await templatesService.removeTemplate('doc1', false, 't1');
    expect(templatesRepository.deleteById as Mock).toHaveBeenCalledWith('t1');
    (templatesRepository.findVisibleById as Mock).mockResolvedValue(null);
    await expect(templatesService.removeTemplate('doc1', false, 'ghost')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('QATE exercise adaptive + cross-week copy', () => {
  it('copies a day into another week plan', async () => {
    const src = {
      plan: { patient_id: 'pat1', status: 'pending_doctor_approval' },
      days: [{ day: { id: 'd1', day_of_week: 1 }, exercises: [{ id: 'e1', name_ar: 'سكوات', name_en: null, sets: 3, reps: 12, rest_seconds: 60, youtube_url: null, notes: null }] }],
    };
    (exercisesRepository.getFullPlan as Mock).mockImplementation(async (pid: string) => {
      if (pid === 'w2') return { plan: { patient_id: 'pat1', status: 'active' }, days: [] };
      return src;
    });
    (exercisesRepository.listByPatient as Mock).mockResolvedValue([{ id: 'w2', week_number: 2, status: 'active' }]);
    (exercisesRepository.insertDay as Mock).mockResolvedValue('d-new');
    const result = await exerciseEditorService.copyDay('p1', 'doc1', { from_day: 1, to_days: [1], to_week_numbers: [2] });
    expect(result?.copied).toBe(1);
    expect(exercisesRepository.insertExercise as Mock).toHaveBeenCalledWith('d-new', expect.objectContaining({ nameAr: 'سكوات' }), 0);
  });

  it('suggests adaptive drafts from visit weight, never active', async () => {
    (patientRepository.findById as Mock).mockResolvedValue({
      id: 'pat1', doctor_id: 'doc1', gender: 'male', birth_date: new Date('1990-01-01'),
      height_cm: 180, initial_weight_kg: 90, current_weight_kg: 90,
      activity_level: 'moderate', goal: 'maintain', chronic_conditions: null, allergies: null,
    });
    (visitsRepository.listByPatient as Mock).mockResolvedValue([{ weight_kg: 85 }]);
    (exercisesRepository.listByPatient as Mock).mockResolvedValue([{ id: 'src', status: 'active' }]);
    (exercisesRepository.getFullPlan as Mock).mockResolvedValue({
      plan: { week_number: 2 },
      days: [{ day: { id: 'd1', day_of_week: 1 }, exercises: [] }],
    });
    (planRevisionsRepository.nextRevisionNo as Mock).mockResolvedValue(1);
    const result = await exerciseEditorService.suggestAdaptive('doc1', 'pat1', null);
    expect(result.weightUsedKg).toBe(85);
    expect(exercisesRepository.insertPlan as Mock).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending_doctor_approval' }));
  });
});
