// Shared DTOs for the food-lists dashboard section (client-side shapes only).
export interface FoodItemDto {
  id: string;
  name_ar: string;
  name_en: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  category: string | null;
  tags: string[] | null;
  pairing_tags: string[] | null;
  is_verified: boolean;
  owner_id: string | null;
  archived: boolean;
}

export interface FoodListDto {
  id: string;
  name_ar: string;
  name_en: string | null;
  owner_id: string | null;
  is_global: boolean;
  item_count: number;
}

export interface ImportIssue {
  row: number;
  name: string;
  reason: string;
}

export interface ImportReport {
  imported: number;
  skipped: ImportIssue[];
  rejected: ImportIssue[];
  total: number;
}

export interface FoodRequestDto {
  id: string;
  name_ar: string;
  name_en: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  category: string | null;
  status: 'pending' | 'approved' | 'rejected';
  review_reason: string | null;
  created_at: string;
}

export const CATEGORY_OPTIONS = [
  'protein',
  'starch',
  'vegetables',
  'fruit',
  'fats',
  'dairy',
  'legumes',
  'beverages',
  'snacks',
  'other',
] as const;

export { readApi } from '@/lib/api/fetch-json';
