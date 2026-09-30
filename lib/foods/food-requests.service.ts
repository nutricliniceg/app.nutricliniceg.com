import { randomUUID } from 'crypto';
import { foodRequestsRepository } from '@/lib/db/repositories/food-requests.repo';
import { foodsRepository } from '@/lib/db/repositories/foods.repo';
import { serviceFail as fail } from '@/lib/errors/fail';
import { checkKcalConsistency, normalizeFoodName } from './consistency';
import type { FoodRequestCreateInput } from './foods.schema';

export const foodRequestsService = {
  // FL-15: doctor submits a request (same ±15% gate as FL-14).
  async submit(doctorId: string, data: FoodRequestCreateInput): Promise<string> {
    const check = checkKcalConsistency({
      calories_per_100g: data.calories_per_100g,
      protein_per_100g: data.protein_per_100g,
      carbs_per_100g: data.carbs_per_100g,
      fats_per_100g: data.fats_per_100g,
    });
    if (!check.ok) {
      throw fail(
        'INCONSISTENT_KCAL',
        `kcal mismatch: declared ${check.declared} vs computed ${check.expected.toFixed(1)} from macros (tolerance ±15%)`
      );
    }
    const id = randomUUID();
    await foodRequestsRepository.insert({
      id,
      doctorId,
      nameAr: data.name_ar.trim(),
      nameEn: data.name_en?.trim() || null,
      caloriesPer100g: data.calories_per_100g,
      proteinPer100g: data.protein_per_100g,
      carbsPer100g: data.carbs_per_100g,
      fatsPer100g: data.fats_per_100g,
      category: data.category ?? null,
    });
    return id;
  },

  async listMine(doctorId: string) {
    return foodRequestsRepository.listByDoctor(doctorId);
  },

  async listQueue() {
    return foodRequestsRepository.listQueue('pending');
  },

  // FL-16: approve converts to a GLOBAL item (visible to all); both paths notify.
  async review(requestId: string, reviewerId: string, decision: 'approve' | 'reject', reason?: string | null) {
    const req = await foodRequestsRepository.findById(requestId);
    if (!req || req.status !== 'pending') return null;
    if (decision === 'approve') {
      const globals = await foodsRepository.listGlobalNames();
      const candAr = normalizeFoodName(req.name_ar);
      const dupe = globals.some(
        (g) =>
          (g.name_ar && normalizeFoodName(g.name_ar) === candAr && candAr !== '') ||
          (req.name_en && g.name_en && normalizeFoodName(g.name_en) === normalizeFoodName(req.name_en))
      );
      if (dupe) {
        await foodRequestsRepository.review(requestId, 'rejected', 'A global item with the same name already exists', reviewerId);
        return { status: 'rejected' as const, foodId: null, doctorId: req.doctor_id, duplicate: true };
      }
      const foodId = randomUUID();
      await foodsRepository.insert({
        id: foodId,
        nameAr: req.name_ar,
        nameEn: req.name_en,
        caloriesPer100g: req.calories_per_100g,
        proteinPer100g: req.protein_per_100g,
        carbsPer100g: req.carbs_per_100g,
        fatsPer100g: req.fats_per_100g,
        category: req.category,
        tags: null,
        pairingTags: null,
        isVerified: true,
        ownerId: null,
      });
      await foodRequestsRepository.review(requestId, 'approved', reason ?? null, reviewerId);
      return { status: 'approved' as const, foodId, doctorId: req.doctor_id, duplicate: false };
    }
    await foodRequestsRepository.review(requestId, 'rejected', reason ?? null, reviewerId);
    return { status: 'rejected' as const, foodId: null, doctorId: req.doctor_id, duplicate: false };
  },
};
