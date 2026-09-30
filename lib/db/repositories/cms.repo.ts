import { executeQuery } from '@/lib/db/pool';

export interface LandingSectionRow {
  id: string;
  key_name: string;
  title_ar: string | null;
  title_en: string | null;
  is_visible: boolean | number;
  sort_order: number;
}

export interface LandingItemRow {
  id: string;
  section_id: string;
  type: string;
  content_ar: string;
  content_en: string | null;
  is_visible: boolean | number;
  sort_order: number;
}

export interface CmsPageRow {
  slug: string;
  title_ar: string;
  title_en: string | null;
  content_ar: string;
  content_en: string | null;
}

export const cmsRepository = {
  async listSections(): Promise<LandingSectionRow[]> {
    return executeQuery<LandingSectionRow[]>('SELECT * FROM LandingPageSection ORDER BY sort_order ASC');
  },

  async updateSection(id: string, patch: { isVisible?: boolean; sortOrder?: number }): Promise<void> {
    const fields: string[] = [];
    const values: Array<number | string | boolean> = [];
    if (patch.isVisible !== undefined) {
      fields.push('is_visible = ?');
      values.push(patch.isVisible);
    }
    if (patch.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(patch.sortOrder);
    }
    if (fields.length === 0) return;
    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- SET columns are fixed literals; values use ? placeholders (D-01)
    await executeQuery(`UPDATE LandingPageSection SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async listItems(sectionId: string): Promise<LandingItemRow[]> {
    return executeQuery<LandingItemRow[]>(
      'SELECT * FROM LandingPageItem WHERE section_id = ? ORDER BY sort_order ASC',
      [sectionId]
    );
  },

  async updateItem(id: string, patch: { isVisible?: boolean; sortOrder?: number }): Promise<void> {
    const fields: string[] = [];
    const values: Array<number | string | boolean> = [];
    if (patch.isVisible !== undefined) {
      fields.push('is_visible = ?');
      values.push(patch.isVisible);
    }
    if (patch.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(patch.sortOrder);
    }
    if (fields.length === 0) return;
    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- SET columns are fixed literals; values use ? placeholders (D-01)
    await executeQuery(`UPDATE LandingPageItem SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async getPage(slug: string): Promise<CmsPageRow | null> {
    const rows = await executeQuery<CmsPageRow[]>(
      'SELECT slug, title_ar, title_en, content_ar, content_en FROM CmsContent WHERE slug = ?',
      [slug]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async updatePage(slug: string, patch: { titleAr?: string; titleEn?: string | null; contentAr?: string; contentEn?: string | null }): Promise<void> {
    const map: Record<string, string> = { titleAr: 'title_ar', titleEn: 'title_en', contentAr: 'content_ar', contentEn: 'content_en' };
    const fields: string[] = [];
    const values: Array<string | null> = [];
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined && map[key]) {
        fields.push(`${map[key]} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return;
    values.push(slug);
    // eslint-disable-next-line no-restricted-syntax -- SET columns come from a fixed map; values use ? placeholders (D-01)
    await executeQuery(`UPDATE CmsContent SET ${fields.join(', ')} WHERE slug = ?`, values);
  },
};
