// FL-03/12: Excel import parsing + template generation (server-only, uses xlsx).
// Column contract (first sheet, header row): name_ar | name_en |
// calories_per_100g | protein_per_100g | carbs_per_100g | fats_per_100g |
// category | tags | pairing_tags   (tags = comma-separated)

import type { ImportRow } from './consistency';

export const IMPORT_HEADERS = [
  'name_ar',
  'name_en',
  'calories_per_100g',
  'protein_per_100g',
  'carbs_per_100g',
  'fats_per_100g',
  'category',
  'tags',
  'pairing_tags',
] as const;

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 1000;

const NUMERIC_FIELDS = [
  'calories_per_100g',
  'protein_per_100g',
  'carbs_per_100g',
  'fats_per_100g',
] as const;

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toStringList(value: unknown): string[] | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export async function parseImportWorkbook(bytes: Uint8Array): Promise<ImportRow[]> {
  const { read, utils } = await import('xlsx');
  const workbook = read(bytes, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('EMPTY_WORKBOOK');
  const sheet = workbook.Sheets[sheetName];
  const raw = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (raw.length > MAX_IMPORT_ROWS) throw new Error('TOO_MANY_ROWS');
  return raw.map((r) => ({
    name_ar: String(r.name_ar ?? '').trim(),
    name_en: String(r.name_en ?? '').trim() || null,
    calories_per_100g: toNumberOrUndefined(r.calories_per_100g) as number,
    protein_per_100g: toNumberOrUndefined(r.protein_per_100g) as number,
    carbs_per_100g: toNumberOrUndefined(r.carbs_per_100g) as number,
    fats_per_100g: toNumberOrUndefined(r.fats_per_100g) as number,
    category: String(r.category ?? '').trim() || null,
    tags: toStringList(r.tags),
    pairing_tags: toStringList(r.pairing_tags),
  }));
}

export function isXlsxMagic(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function buildTemplateWorkbook(): Promise<Buffer> {
  const { utils, write } = await import('xlsx');
  const rows = [
    Object.fromEntries(IMPORT_HEADERS.map((h) => [h, h])),
    {
      name_ar: 'صدر دجاج مشوي',
      name_en: 'Grilled chicken breast',
      calories_per_100g: 165,
      protein_per_100g: 31,
      carbs_per_100g: 0,
      fats_per_100g: 3.6,
      category: 'protein',
      tags: 'gluten-free',
      pairing_tags: 'high-protein, post-workout',
    },
    {
      name_ar: 'أرز أبيض مسلوق',
      name_en: 'Boiled white rice',
      calories_per_100g: 130,
      protein_per_100g: 2.7,
      carbs_per_100g: 28,
      fats_per_100g: 0.3,
      category: 'starch',
      tags: 'vegan, gluten-free',
      pairing_tags: 'neutral-base',
    },
  ];
  const sheet = utils.json_to_sheet(rows, { skipHeader: true });
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'Foods');
  const out = write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(out);
}

export function numericFieldNames(): readonly string[] {
  return NUMERIC_FIELDS;
}
