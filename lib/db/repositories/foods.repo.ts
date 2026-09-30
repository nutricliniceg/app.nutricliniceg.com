import { executeQuery } from '@/lib/db/pool';

export interface FoodItem {
  id: string;
  name_ar: string;
  name_en: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  potassium_mg_per_100g: number | null;
  phosphorus_mg_per_100g: number | null;
  sodium_mg_per_100g: number | null;
  added_sugar_g_per_100g: number | null;
  category: string | null;
  tags: string[] | null;
  pairing_tags: string[] | null;
  is_verified: boolean;
  owner_id: string | null;
  archived: boolean;
  created_at: Date;
  updated_at: Date;
}

interface FoodItemRow {
  id: string;
  name_ar: string;
  name_en: string | null;
  calories_per_100g: number | string;
  protein_per_100g: number | string;
  carbs_per_100g: number | string;
  fats_per_100g: number | string;
  potassium_mg_per_100g: number | string | null;
  phosphorus_mg_per_100g: number | string | null;
  sodium_mg_per_100g: number | string | null;
  added_sugar_g_per_100g: number | string | null;
  category: string | null;
  tags: string | null;
  pairing_tags: string | null;
  is_verified: number | boolean;
  owner_id: string | null;
  archived: number | boolean;
  created_at: Date;
  updated_at: Date;
}

function parseJsonList(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row: FoodItemRow): FoodItem {
  return {
    id: row.id,
    name_ar: row.name_ar,
    name_en: row.name_en,
    calories_per_100g: Number(row.calories_per_100g),
    protein_per_100g: Number(row.protein_per_100g),
    carbs_per_100g: Number(row.carbs_per_100g),
    fats_per_100g: Number(row.fats_per_100g),
    potassium_mg_per_100g: toNullableNumber(row.potassium_mg_per_100g),
    phosphorus_mg_per_100g: toNullableNumber(row.phosphorus_mg_per_100g),
    sodium_mg_per_100g: toNullableNumber(row.sodium_mg_per_100g),
    added_sugar_g_per_100g: toNullableNumber(row.added_sugar_g_per_100g),
    category: row.category,
    tags: parseJsonList(row.tags),
    pairing_tags: parseJsonList(row.pairing_tags),
    is_verified: Boolean(row.is_verified),
    owner_id: row.owner_id,
    archived: Boolean(row.archived),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface FoodItemInsert {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatsPer100g: number;
  potassiumMgPer100g?: number | null;
  phosphorusMgPer100g?: number | null;
  sodiumMgPer100g?: number | null;
  addedSugarGPer100g?: number | null;
  category?: string | null;
  tags?: string[] | null;
  pairingTags?: string[] | null;
  isVerified: boolean;
  ownerId: string | null;
}

export interface FoodItemPatch {
  nameAr?: string;
  nameEn?: string | null;
  caloriesPer100g?: number;
  proteinPer100g?: number;
  carbsPer100g?: number;
  fatsPer100g?: number;
  category?: string | null;
  tags?: string[] | null;
  pairingTags?: string[] | null;
}

export interface FoodFilters {
  search?: string;
  category?: string;
  tag?: string;
  scope?: 'all' | 'global' | 'mine';
  includeArchived?: boolean;
  page?: number;
  limit?: number;
}

const FOOD_SELECT =
  'SELECT id, name_ar, name_en, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, potassium_mg_per_100g, phosphorus_mg_per_100g, sodium_mg_per_100g, added_sugar_g_per_100g, category, tags, pairing_tags, is_verified, owner_id, archived, created_at, updated_at';

function scopeClause(scope: FoodFilters['scope'], isAdmin: boolean): { sql: string; params: string[] } {
  if (isAdmin) {
    if (scope === 'global') return { sql: 'owner_id IS NULL', params: [] };
    if (scope === 'mine') return { sql: 'owner_id IS NOT NULL', params: [] };
    return { sql: '1 = 1', params: [] };
  }
  if (scope === 'global') return { sql: 'owner_id IS NULL', params: [] };
  if (scope === 'mine') return { sql: 'owner_id = ?', params: ['__doctor__'] };
  return { sql: '(owner_id IS NULL OR owner_id = ?)', params: ['__doctor__'] };
}

function buildWhere(doctorId: string, f: FoodFilters, isAdmin: boolean): { sql: string; params: Array<string | number> } {
  const parts: string[] = [];
  const params: Array<string | number> = [];
  const scope = scopeClause(f.scope, isAdmin);
  parts.push(`(${scope.sql})`);
  for (const p of scope.params) params.push(p === '__doctor__' ? doctorId : p);
  if (!f.includeArchived) parts.push('archived = FALSE');
  if (f.search) {
    parts.push('(name_ar LIKE ? OR name_en LIKE ?)');
    params.push(`%${f.search}%`, `%${f.search}%`);
  }
  if (f.category) {
    parts.push('category = ?');
    params.push(f.category);
  }
  if (f.tag) {
    parts.push('JSON_CONTAINS(tags, JSON_QUOTE(?))');
    params.push(f.tag);
  }
  return { sql: parts.join(' AND '), params };
}

export interface FoodListResult {
  items: FoodItem[];
  total: number;
  page: number;
  limit: number;
}

async function listWith(actorId: string, filters: FoodFilters, isAdmin: boolean): Promise<FoodListResult> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const offset = (page - 1) * limit;
  const { sql, params } = buildWhere(actorId, filters, isAdmin);
  const [rows, totalRows] = await Promise.all([
    executeQuery<FoodItemRow[]>(
      `${FOOD_SELECT} FROM FoodItem WHERE ${sql} ORDER BY name_ar ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ),
    executeQuery<{ count: number }[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE assembled from fixed fragments; values use ? placeholders (D-01)
      `SELECT COUNT(*) as count FROM FoodItem WHERE ${sql}`,
      params
    ),
  ]);
  return { items: rows.map(mapRow), total: totalRows[0].count, page, limit };
}

const PATCH_MAP: Record<keyof FoodItemPatch, string> = {
  nameAr: 'name_ar',
  nameEn: 'name_en',
  caloriesPer100g: 'calories_per_100g',
  proteinPer100g: 'protein_per_100g',
  carbsPer100g: 'carbs_per_100g',
  fatsPer100g: 'fats_per_100g',
  category: 'category',
  tags: 'tags',
  pairingTags: 'pairing_tags',
};

function patchEntries(patch: FoodItemPatch): Array<[string, string | number | null]> {
  const out: Array<[string, string | number | null]> = [];
  for (const [key, column] of Object.entries(PATCH_MAP) as Array<[keyof FoodItemPatch, string]>) {
    const value = patch[key];
    if (value === undefined) continue;
    if (key === 'tags' || key === 'pairingTags') {
      out.push([column, value ? JSON.stringify(value) : null]);
    } else {
      out.push([column, value as string | number | null]);
    }
  }
  return out;
}

export const foodsRepository = {
  insert: async (data: FoodItemInsert): Promise<void> => {
    await executeQuery(
      `INSERT INTO FoodItem (id, name_ar, name_en, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g, potassium_mg_per_100g, phosphorus_mg_per_100g, sodium_mg_per_100g, added_sugar_g_per_100g, category, tags, pairing_tags, is_verified, owner_id, archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [
        data.id,
        data.nameAr,
        data.nameEn ?? null,
        data.caloriesPer100g,
        data.proteinPer100g,
        data.carbsPer100g,
        data.fatsPer100g,
        data.potassiumMgPer100g ?? null,
        data.phosphorusMgPer100g ?? null,
        data.sodiumMgPer100g ?? null,
        data.addedSugarGPer100g ?? null,
        data.category ?? null,
        data.tags ? JSON.stringify(data.tags) : null,
        data.pairingTags ? JSON.stringify(data.pairingTags) : null,
        data.isVerified,
        data.ownerId,
      ]
    );
  },

  findById: async (id: string): Promise<FoodItem | null> => {
    const rows = await executeQuery<FoodItemRow[]>(FOOD_SELECT + ' FROM FoodItem WHERE id = ?', [id]);
    return rows.length > 0 ? mapRow(rows[0]) : null;
  },

  findByIds: async (ids: string[]): Promise<FoodItem[]> => {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await executeQuery<FoodItemRow[]>(
      `${FOOD_SELECT} FROM FoodItem WHERE id IN (${placeholders}) AND archived = FALSE`,
      ids
    );
    return rows.map(mapRow);
  },

  // Doctor view: global (owner NULL) + own items (FL-01/02/10).
  listVisible: async (doctorId: string, filters: FoodFilters = {}): Promise<FoodListResult> => {
    return listWith(doctorId, filters, false);
  },

  listForAdmin: async (adminId: string, filters: FoodFilters = {}): Promise<FoodListResult> => {
    return listWith(adminId, filters, true);
  },

  // Names visible to a doctor (for FL-04 dedupe), non-archived only.
  listVisibleNames: async (doctorId: string): Promise<Array<{ name_ar: string; name_en: string | null }>> => {
    return executeQuery<Array<{ name_ar: string; name_en: string | null }>>(
      'SELECT name_ar, name_en FROM FoodItem WHERE (owner_id IS NULL OR owner_id = ?) AND archived = FALSE',
      [doctorId]
    );
  },

  listGlobalNames: async (): Promise<Array<{ name_ar: string; name_en: string | null }>> => {
    return executeQuery<Array<{ name_ar: string; name_en: string | null }>>(
      'SELECT name_ar, name_en FROM FoodItem WHERE owner_id IS NULL AND archived = FALSE',
      []
    );
  },

  // P14 candidate pool: ADMIN global items first, then the doctor's own
  // (NP-20 ranking). Bounded for prompt size; archived excluded.
  listCandidates: async (doctorId: string, includeOwn: boolean, limit: number): Promise<FoodItem[]> => {
    const cap = Math.min(Math.max(limit, 1), 200);
    const rows = await executeQuery<FoodItemRow[]>(
      `${FOOD_SELECT} FROM FoodItem WHERE archived = FALSE AND (owner_id IS NULL${includeOwn ? ' OR owner_id = ?' : ''}) ORDER BY owner_id IS NOT NULL, name_ar ASC LIMIT ?`,
      includeOwn ? [doctorId, cap] : [cap]
    );
    return rows.map(mapRow);
  },

  updateOwn: async (id: string, doctorId: string, patch: FoodItemPatch): Promise<boolean> => {
    const entries = patchEntries(patch);
    if (entries.length === 0) return true;
    const sets = entries.map(([col]) => `${col} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    await executeQuery(
      // eslint-disable-next-line no-restricted-syntax -- SET columns from a fixed map; values use ? placeholders (D-01)
      `UPDATE FoodItem SET ${sets}, updated_at = ? WHERE id = ? AND owner_id = ?`,
      [...values, new Date(), id, doctorId]
    );
    return true;
  },

  updateGlobal: async (id: string, patch: FoodItemPatch): Promise<boolean> => {
    const entries = patchEntries(patch);
    if (entries.length === 0) return true;
    const sets = entries.map(([col]) => `${col} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    await executeQuery(
      // eslint-disable-next-line no-restricted-syntax -- SET columns from a fixed map; values use ? placeholders (D-01)
      `UPDATE FoodItem SET ${sets}, updated_at = ? WHERE id = ? AND owner_id IS NULL`,
      [...values, new Date(), id]
    );
    return true;
  },

  setArchived: async (id: string, archived: boolean): Promise<void> => {
    await executeQuery('UPDATE FoodItem SET archived = ?, updated_at = ? WHERE id = ?', [archived, new Date(), id]);
  },

  remove: async (id: string): Promise<void> => {
    await executeQuery('DELETE FROM FoodItem WHERE id = ?', [id]);
  },

  // FL-17: plans referencing this item block hard delete.
  countPlanReferences: async (foodId: string): Promise<number> => {
    const rows = await executeQuery<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM NutritionPlanMealItem WHERE food_id = ?',
      [foodId]
    );
    return Number(rows[0].count);
  },
};
