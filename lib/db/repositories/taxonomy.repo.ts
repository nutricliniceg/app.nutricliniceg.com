import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  slug: string;
  name_ar: string;
  name_en: string | null;
  description: string | null;
  sort_order: number;
}

export interface TagRow {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
}

export const taxonomyRepository = {
  async listCategories(): Promise<CategoryRow[]> {
    return executeQuery<CategoryRow[]>('SELECT * FROM BlogCategory ORDER BY sort_order ASC, name_ar ASC');
  },

  async insertCategory(data: { slug: string; nameAr: string; nameEn?: string | null; description?: string | null; sortOrder?: number }): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      'INSERT INTO BlogCategory (id, slug, name_ar, name_en, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.slug, data.nameAr, data.nameEn ?? null, data.description ?? null, data.sortOrder ?? 0]
    );
    return id;
  },

  async deleteCategory(id: string): Promise<void> {
    await executeQuery('UPDATE BlogPost SET category_id = NULL WHERE category_id = ?', [id]);
    await executeQuery('DELETE FROM BlogCategory WHERE id = ?', [id]);
  },

  async listTags(): Promise<TagRow[]> {
    return executeQuery<TagRow[]>('SELECT * FROM BlogTag ORDER BY name_ar ASC');
  },

  async insertTag(data: { slug: string; nameAr: string; nameEn?: string | null }): Promise<string> {
    const id = randomUUID();
    await executeQuery('INSERT INTO BlogTag (id, slug, name_ar, name_en) VALUES (?, ?, ?, ?)', [id, data.slug, data.nameAr, data.nameEn ?? null]);
    return id;
  },

  async deleteTag(id: string): Promise<void> {
    await executeQuery('DELETE FROM BlogTag WHERE id = ?', [id]);
  },
};
