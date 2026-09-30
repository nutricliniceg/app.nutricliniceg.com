import { executeQuery } from '@/lib/db/pool';

// CMP-04 export/erase SQL isolated here; the service orchestrates.
const EXPORT_TABLES = [
  'Patient',
  'Visit',
  'NutritionPlan',
  'ExercisePlan',
  'PatientMessage',
  'AiUsageLog',
  'FileAsset',
  'Subscription',
] as const;

const OWNER_COLUMN: Record<string, string> = {
  FileAsset: 'owner_id',
  Subscription: 'user_id',
};

export const privacyRepository = {
  async exportTable(table: string, userId: string): Promise<Array<Record<string, unknown>>> {
    if (!EXPORT_TABLES.includes(table as (typeof EXPORT_TABLES)[number])) {
      throw new Error(`privacy export: unknown table ${table}`);
    }
    const col = OWNER_COLUMN[table] ?? 'doctor_id';
    return executeQuery<Array<Record<string, unknown>>>(
      // eslint-disable-next-line no-restricted-syntax -- D-01: table/column are allowlisted constants, value is a ? placeholder
      `SELECT * FROM ${table} WHERE ${col} = ?`,
      [userId]
    );
  },

  async hardDeleteUser(userId: string): Promise<void> {
    await executeQuery('DELETE FROM User WHERE id = ?', [userId]);
  },
};
