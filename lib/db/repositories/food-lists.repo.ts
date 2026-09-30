import { executeQuery } from '@/lib/db/pool';

export interface FoodList {
  id: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  owner_id: string | null;
  is_global: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FoodListWithCount extends FoodList {
  item_count: number;
}

export interface FoodListItemRow {
  id: string;
  list_id: string;
  food_id: string;
  order_index: number;
}

const LIST_SELECT =
  'SELECT id, name_ar, name_en, description_ar, description_en, owner_id, is_global, created_at, updated_at';

export const foodListsRepository = {
  insert: async (data: {
    id: string;
    nameAr: string;
    nameEn?: string | null;
    descriptionAr?: string | null;
    descriptionEn?: string | null;
    ownerId: string | null;
    isGlobal: boolean;
  }): Promise<void> => {
    await executeQuery(
      `INSERT INTO FoodList (id, name_ar, name_en, description_ar, description_en, owner_id, is_global)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.nameAr, data.nameEn ?? null, data.descriptionAr ?? null, data.descriptionEn ?? null, data.ownerId, data.isGlobal]
    );
  },

  findById: async (id: string): Promise<FoodList | null> => {
    const rows = await executeQuery<FoodList[]>(LIST_SELECT + ' FROM FoodList WHERE id = ?', [id]);
    return rows.length > 0 ? { ...rows[0], is_global: Boolean(rows[0].is_global) } : null;
  },

  // Doctor sees global lists + own lists (FL-10 mirror of foods visibility).
  listVisible: async (doctorId: string): Promise<FoodListWithCount[]> => {
    const rows = await executeQuery<FoodListWithCount[]>(
      `SELECT l.id, l.name_ar, l.name_en, l.description_ar, l.description_en, l.owner_id, l.is_global, l.created_at, l.updated_at,
              COUNT(li.id) as item_count
       FROM FoodList l LEFT JOIN FoodListItem li ON li.list_id = l.id
       WHERE l.is_global = TRUE OR l.owner_id = ?
       GROUP BY l.id ORDER BY l.created_at DESC`,
      [doctorId]
    );
    return rows.map((r) => ({ ...r, is_global: Boolean(r.is_global), item_count: Number(r.item_count) }));
  },

  listGlobal: async (): Promise<FoodListWithCount[]> => {
    const rows = await executeQuery<FoodListWithCount[]>(
      `SELECT l.id, l.name_ar, l.name_en, l.description_ar, l.description_en, l.owner_id, l.is_global, l.created_at, l.updated_at,
              COUNT(li.id) as item_count
       FROM FoodList l LEFT JOIN FoodListItem li ON li.list_id = l.id
       WHERE l.is_global = TRUE
       GROUP BY l.id ORDER BY l.created_at DESC`,
      []
    );
    return rows.map((r) => ({ ...r, is_global: Boolean(r.is_global), item_count: Number(r.item_count) }));
  },

  listAllForAdmin: async (): Promise<FoodListWithCount[]> => {
    const rows = await executeQuery<FoodListWithCount[]>(
      `SELECT l.id, l.name_ar, l.name_en, l.description_ar, l.description_en, l.owner_id, l.is_global, l.created_at, l.updated_at,
              COUNT(li.id) as item_count
       FROM FoodList l LEFT JOIN FoodListItem li ON li.list_id = l.id
       GROUP BY l.id ORDER BY l.created_at DESC`,
      []
    );
    return rows.map((r) => ({ ...r, is_global: Boolean(r.is_global), item_count: Number(r.item_count) }));
  },

  update: async (id: string, patch: { nameAr?: string; nameEn?: string | null; descriptionAr?: string | null; descriptionEn?: string | null }): Promise<void> => {
    const map: Record<string, string> = { nameAr: 'name_ar', nameEn: 'name_en', descriptionAr: 'description_ar', descriptionEn: 'description_en' };
    const sets: string[] = [];
    const values: Array<string | null> = [];
    for (const [key, column] of Object.entries(map)) {
      const value = patch[key as keyof typeof patch];
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        values.push(value);
      }
    }
    if (sets.length === 0) return;
    await executeQuery(
      // eslint-disable-next-line no-restricted-syntax -- SET columns from a fixed map; values use ? placeholders (D-01)
      `UPDATE FoodList SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`,
      [...values, new Date(), id]
    );
  },

  remove: async (id: string): Promise<void> => {
    await executeQuery('DELETE FROM FoodList WHERE id = ?', [id]);
  },

  listItems: async (listId: string): Promise<FoodListItemRow[]> => {
    return executeQuery<FoodListItemRow[]>(
      'SELECT id, list_id, food_id, order_index FROM FoodListItem WHERE list_id = ? ORDER BY order_index ASC',
      [listId]
    );
  },

  addItem: async (id: string, listId: string, foodId: string, orderIndex: number): Promise<void> => {
    await executeQuery('INSERT IGNORE INTO FoodListItem (id, list_id, food_id, order_index) VALUES (?, ?, ?, ?)', [
      id,
      listId,
      foodId,
      orderIndex,
    ]);
  },

  removeItem: async (listId: string, foodId: string): Promise<void> => {
    await executeQuery('DELETE FROM FoodListItem WHERE list_id = ? AND food_id = ?', [listId, foodId]);
  },
};
