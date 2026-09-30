import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface PlanTemplateRow {
  id: string;
  owner_id: string | null;
  is_global: number | boolean;
  template_type: 'nutrition' | 'exercise';
  category: string | null;
  name: string;
  description: string | null;
  snapshot: string;
  reference_calories: number | null;
  reference_protein_g: number | null;
  reference_carbs_g: number | null;
  reference_fats_g: number | null;
  usage_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface TemplateInsert {
  id: string;
  ownerId: string | null;
  isGlobal: boolean;
  templateType: 'nutrition' | 'exercise';
  category: string;
  name: string;
  description: string | null;
  snapshot: unknown;
  referenceCalories: number | null;
  referenceProteinG: number | null;
  referenceCarbsG: number | null;
  referenceFatsG: number | null;
}

export interface TemplateListFilters {
  search?: string;
  category?: string;
  type?: 'nutrition' | 'exercise';
  sort?: 'usage' | 'recent';
}

const SELECT = 'SELECT * FROM PlanTemplate';

export const templatesRepository = {
  insert: async (data: TemplateInsert): Promise<void> => {
    await executeQuery(
      `INSERT INTO PlanTemplate (id, owner_id, is_global, template_type, category, name, description, snapshot,
        reference_calories, reference_protein_g, reference_carbs_g, reference_fats_g, usage_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        data.id || randomUUID(),
        data.ownerId,
        data.isGlobal,
        data.templateType,
        data.category,
        data.name,
        data.description,
        JSON.stringify(data.snapshot),
        data.referenceCalories,
        data.referenceProteinG,
        data.referenceCarbsG,
        data.referenceFatsG,
      ]
    );
  },

  findVisibleById: async (id: string, doctorId: string, isAdmin: boolean): Promise<PlanTemplateRow | null> => {
    const rows = await executeQuery<PlanTemplateRow[]>(SELECT + ' WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const row = rows[0];
    const global = row.is_global === true || row.is_global === 1;
    if (global) return row;
    if (isAdmin) return row;
    if (row.owner_id === doctorId) return row;
    return null;
  },

  listVisible: async (doctorId: string, filters: TemplateListFilters): Promise<PlanTemplateRow[]> => {
    const where: string[] = ['(is_global = TRUE OR owner_id = ?)'];
    const params: Array<string | number> = [doctorId];
    if (filters.type) {
      where.push('template_type = ?');
      params.push(filters.type);
    }
    if (filters.category) {
      where.push('category = ?');
      params.push(filters.category);
    }
    if (filters.search) {
      where.push('(name LIKE ? OR description LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    const order = filters.sort === 'usage' ? 'usage_count DESC, created_at DESC' : 'created_at DESC';
    const sql = `${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`;
    return executeQuery<PlanTemplateRow[]>(sql, params);
  },

  incrementUsage: async (id: string): Promise<void> => {
    await executeQuery('UPDATE PlanTemplate SET usage_count = usage_count + 1 WHERE id = ?', [id]);
  },

  updateById: async (id: string, patch: { name?: string; description?: string | null; category?: string }): Promise<void> => {
    const fields: string[] = [];
    const values: Array<string | null> = [];
    if (patch.name !== undefined) {
      fields.push('name = ?');
      values.push(patch.name);
    }
    if (patch.description !== undefined) {
      fields.push('description = ?');
      values.push(patch.description);
    }
    if (patch.category !== undefined) {
      fields.push('category = ?');
      values.push(patch.category);
    }
    if (fields.length === 0) return;
    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- SET columns are fixed literals; values use ? placeholders (D-01)
    await executeQuery(`UPDATE PlanTemplate SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  deleteById: async (id: string): Promise<void> => {
    await executeQuery('DELETE FROM PlanTemplate WHERE id = ?', [id]);
  },
};
