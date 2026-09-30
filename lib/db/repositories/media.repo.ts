import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface MediaRow {
  id: string;
  uploader_id: string | null;
  filename: string;
  original_name: string | null;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  folder: string | null;
  url: string;
  variants: string | null;
  created_at: Date;
}

export interface MediaInsert {
  uploaderId: string | null;
  filename: string;
  originalName: string | null;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string;
  folder: string | null;
  url: string;
  variants: unknown;
}

export const mediaRepository = {
  async insert(data: MediaInsert): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      `INSERT INTO MediaAsset (id, uploader_id, filename, original_name, mime, size_bytes, width, height, alt_text, folder, url, variants)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.uploaderId, data.filename, data.originalName, data.mime, data.sizeBytes,
        data.width, data.height, data.altText, data.folder, data.url, JSON.stringify(data.variants ?? null)]
    );
    return id;
  },

  async findById(id: string): Promise<MediaRow | null> {
    const rows = await executeQuery<MediaRow[]>('SELECT * FROM MediaAsset WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  },

  async list(filters: { q?: string; type?: 'image' | 'other'; folder?: string }): Promise<MediaRow[]> {
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filters.q) {
      where.push('(original_name LIKE ? OR filename LIKE ?)');
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (filters.type === 'image') where.push("mime LIKE 'image/%'");
    if (filters.type === 'other') where.push("mime NOT LIKE 'image/%'");
    if (filters.folder) {
      where.push('folder = ?');
      params.push(filters.folder);
    }
    const clause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
    return executeQuery<MediaRow[]>(`SELECT * FROM MediaAsset ${clause} ORDER BY created_at DESC LIMIT 200`, params);
  },

  async update(id: string, patch: { altText?: string; folder?: string | null }): Promise<void> {    const fields: string[] = [];
    const values: Array<string | null> = [];
    if (patch.altText !== undefined) {
      fields.push('alt_text = ?');
      values.push(patch.altText);
    }
    if (patch.folder !== undefined) {
      fields.push('folder = ?');
      values.push(patch.folder);
    }
    if (fields.length === 0) return;
    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- SET columns are fixed literals; values use ? placeholders (D-01)
    await executeQuery(`UPDATE MediaAsset SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async setUrl(id: string, url: string): Promise<void> {
    await executeQuery('UPDATE MediaAsset SET url = ? WHERE id = ?', [url, id]);
  },

  async remove(id: string): Promise<void> {
    await executeQuery('DELETE FROM MediaAsset WHERE id = ?', [id]);
  },

  // Delete guard (BLG-23): referenced in live blog/CMS content.
  async referenceCount(urlPath: string): Promise<number> {
    const [a, b] = await Promise.all([
      executeQuery<{ count: number }[]>(`SELECT COUNT(*) as count FROM BlogPost WHERE featured_image LIKE ? OR og_image LIKE ? OR content_html LIKE ?`, [`%${urlPath}%`, `%${urlPath}%`, `%${urlPath}%`]),
      executeQuery<{ count: number }[]>(`SELECT COUNT(*) as count FROM CmsContent WHERE content_ar LIKE ? OR content_en LIKE ?`, [`%${urlPath}%`, `%${urlPath}%`]),
    ]);
    return a[0].count + b[0].count;
  },
};
