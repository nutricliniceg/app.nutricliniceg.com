import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface SubscriptionPlanRow {
  id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  price_monthly: number | string;
  price_yearly: number | string | null;
  duration_days: number;
  max_patients: number | null;
  max_ai_calls_monthly: number | null;
  features: string | null;
  is_active: boolean | number;
  sort_order: number;
}

export interface SubscriptionPlanInput {
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  priceMonthly: number;
  priceYearly?: number | null;
  durationDays: number;
  maxPatients?: number | null;
  maxAiCallsMonthly?: number | null;
  features?: unknown;
  isActive?: boolean;
  sortOrder?: number;
}

export const subscriptionPlansRepository = {
  async listAll(): Promise<SubscriptionPlanRow[]> {
    return executeQuery<SubscriptionPlanRow[]>(
      'SELECT * FROM SubscriptionPlan ORDER BY sort_order ASC, created_at ASC'
    );
  },

  async findById(id: string): Promise<SubscriptionPlanRow | null> {
    const rows = await executeQuery<SubscriptionPlanRow[]>('SELECT * FROM SubscriptionPlan WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  },

  async insert(data: SubscriptionPlanInput): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      `INSERT INTO SubscriptionPlan (id, name_ar, name_en, description_ar, description_en, price_monthly, price_yearly,
        duration_days, max_patients, max_ai_calls_monthly, features, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.nameAr, data.nameEn, data.descriptionAr ?? null, data.descriptionEn ?? null,
        data.priceMonthly, data.priceYearly ?? null, data.durationDays, data.maxPatients ?? null,
        data.maxAiCallsMonthly ?? null, data.features ? JSON.stringify(data.features) : null,
        data.isActive ?? true, data.sortOrder ?? 0]
    );
    return id;
  },

  async update(id: string, data: Partial<SubscriptionPlanInput>): Promise<void> {
    const map: Record<string, string> = {
      nameAr: 'name_ar', nameEn: 'name_en', descriptionAr: 'description_ar', descriptionEn: 'description_en',
      priceMonthly: 'price_monthly', priceYearly: 'price_yearly', durationDays: 'duration_days',
      maxPatients: 'max_patients', maxAiCallsMonthly: 'max_ai_calls_monthly', features: 'features',
      isActive: 'is_active', sortOrder: 'sort_order',
    };
    const fields: string[] = [];
    const values: Array<string | number | boolean | null> = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && map[key]) {
        fields.push(`${map[key]} = ?`);
        values.push(key === 'features' && value !== null ? JSON.stringify(value) : (value as string | number | boolean | null));
      }
    }
    if (fields.length === 0) return;
    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- SET columns come from a fixed map; values use ? placeholders (D-01)
    await executeQuery(`UPDATE SubscriptionPlan SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async remove(id: string): Promise<void> {
    await executeQuery('DELETE FROM SubscriptionPlan WHERE id = ?', [id]);
  },
};
