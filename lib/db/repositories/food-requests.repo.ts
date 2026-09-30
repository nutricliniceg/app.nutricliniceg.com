import { executeQuery } from '@/lib/db/pool';

export type FoodRequestStatus = 'pending' | 'approved' | 'rejected';

export interface FoodRequest {
  id: string;
  doctor_id: string;
  name_ar: string;
  name_en: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  category: string | null;
  status: FoodRequestStatus;
  review_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

const REQUEST_SELECT =
  'SELECT id, doctor_id, name_ar, name_en, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, category, status, review_reason, reviewed_by, reviewed_at, created_at';

export const foodRequestsRepository = {
  insert: async (data: {
    id: string;
    doctorId: string;
    nameAr: string;
    nameEn?: string | null;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatsPer100g: number;
    category?: string | null;
  }): Promise<void> => {
    await executeQuery(
      `INSERT INTO FoodRequest (id, doctor_id, name_ar, name_en, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, category, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        data.id,
        data.doctorId,
        data.nameAr,
        data.nameEn ?? null,
        data.caloriesPer100g,
        data.proteinPer100g,
        data.carbsPer100g,
        data.fatsPer100g,
        data.category ?? null,
      ]
    );
  },

  findById: async (id: string): Promise<FoodRequest | null> => {
    const rows = await executeQuery<FoodRequest[]>(REQUEST_SELECT + ' FROM FoodRequest WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      calories_per_100g: Number(r.calories_per_100g),
      protein_per_100g: Number(r.protein_per_100g),
      carbs_per_100g: Number(r.carbs_per_100g),
      fats_per_100g: Number(r.fats_per_100g),
    };
  },

  listByDoctor: async (doctorId: string): Promise<FoodRequest[]> => {
    return executeQuery<FoodRequest[]>(
      REQUEST_SELECT + ' FROM FoodRequest WHERE doctor_id = ? ORDER BY created_at DESC',
      [doctorId]
    );
  },

  listQueue: async (status: FoodRequestStatus = 'pending'): Promise<FoodRequest[]> => {
    return executeQuery<FoodRequest[]>(
      REQUEST_SELECT + ' FROM FoodRequest WHERE status = ? ORDER BY created_at ASC',
      [status]
    );
  },

  review: async (id: string, status: Exclude<FoodRequestStatus, 'pending'>, reason: string | null, reviewerId: string): Promise<void> => {
    await executeQuery(
      'UPDATE FoodRequest SET status = ?, review_reason = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = ?',
      [status, reason, reviewerId, new Date(), id, 'pending']
    );
  },
};
