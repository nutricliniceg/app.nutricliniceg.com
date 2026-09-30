import { executeQuery } from '@/lib/db/pool';

export interface AdminUserFilters {
  search?: string;
  role?: 'doctor' | 'admin' | 'super_admin';
  status?: 'active' | 'inactive' | 'pending';
  planId?: string;
  page?: number;
  limit?: number;
}

// Central admin queries (ADM-01..03, ADM-24). All values parameterized.
export const adminRepository = {
  async listUsers(filters: AdminUserFilters): Promise<{ users: Record<string, unknown>[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filters.role) {
      where.push('u.role = ?');
      params.push(filters.role);
    }
    if (filters.status === 'active') where.push('u.is_active = TRUE');
    if (filters.status === 'inactive') where.push('u.is_active = FALSE');
    if (filters.status === 'pending') {
      where.push("u.role = 'doctor'");
      where.push('u.is_active = FALSE');
    }
    if (filters.planId) {
      where.push('u.subscription_plan_id = ?');
      params.push(filters.planId);
    }
    if (filters.search) {
      where.push('(u.name LIKE ? OR u.email LIKE ? OR u.clinic_name LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const users = await executeQuery<Record<string, unknown>[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.clinic_name, u.is_active, u.email_verified,
        u.subscription_plan_id, sp.name_en AS plan_name, u.subscription_ends_at, u.trial_ends_at, u.created_at
       FROM User u LEFT JOIN SubscriptionPlan sp ON sp.id = u.subscription_plan_id
       ${clause} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRows = await executeQuery<{ count: number }[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT COUNT(*) as count FROM User u ${clause}`,
      params
    );
    return { users, total: totalRows[0].count };
  },

  async countPending(): Promise<number> {
    const rows = await executeQuery<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM User WHERE role = 'doctor' AND is_active = FALSE"
    );
    return rows[0].count;
  },

  async countNewContacts(): Promise<number> {
    const rows = await executeQuery<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM ContactMessage WHERE status = 'new'"
    );
    return rows[0].count;
  },

  async overview(): Promise<{
    doctors_total: number;
    doctors_active: number;
    pending_activations: number;
    subscriptions_by_plan: Array<{ plan_id: string | null; plan_name: string; users: number; price_monthly: number }>;
    mrr_estimate: number;
  }> {
    const [[totals], [actives], [pending], byPlan] = await Promise.all([
      executeQuery<{ count: number }[]>("SELECT COUNT(*) as count FROM User WHERE role = 'doctor'"),
      executeQuery<{ count: number }[]>("SELECT COUNT(*) as count FROM User WHERE role = 'doctor' AND is_active = TRUE"),
      executeQuery<{ count: number }[]>("SELECT COUNT(*) as count FROM User WHERE role = 'doctor' AND is_active = FALSE"),
      executeQuery<Array<{ plan_id: string | null; plan_name: string; users: number; price_monthly: number | string }>>(
        `SELECT u.subscription_plan_id AS plan_id, COALESCE(sp.name_en, 'none') AS plan_name,
          COUNT(*) AS users, COALESCE(sp.price_monthly, 0) AS price_monthly
         FROM User u LEFT JOIN SubscriptionPlan sp ON sp.id = u.subscription_plan_id
         WHERE u.role = 'doctor' AND u.is_active = TRUE GROUP BY u.subscription_plan_id, sp.name_en, sp.price_monthly`
      ),
    ]);
    const plans = byPlan.map((r) => ({ ...r, users: Number(r.users), price_monthly: Number(r.price_monthly) }));
    const mrr = plans.reduce((s, p) => s + p.users * p.price_monthly, 0);
    return {
      doctors_total: totals.count,
      doctors_active: actives.count,
      pending_activations: pending.count,
      subscriptions_by_plan: plans,
      mrr_estimate: Math.round(mrr * 100) / 100,
    };
  },
};
