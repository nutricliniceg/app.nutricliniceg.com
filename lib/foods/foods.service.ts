import { randomUUID } from 'crypto';
import { foodsRepository, type FoodItem } from '@/lib/db/repositories/foods.repo';
import { serviceFail as fail } from '@/lib/errors/fail';
import { checkKcalConsistency, normalizeFoodName, validateImportRow, type ImportRow } from './consistency';
import type { FoodCreateInput, FoodUpdateInput, FoodListQuery } from './foods.schema';

export function serviceErrorCode(err: unknown): string {
  return (err as { code?: string }).code ?? 'FOOD_ERROR';
}

function toPer100(data: FoodCreateInput | FoodUpdateInput) {
  return {
    calories_per_100g: Number(data.calories_per_100g),
    protein_per_100g: Number(data.protein_per_100g),
    carbs_per_100g: Number(data.carbs_per_100g),
    fats_per_100g: Number(data.fats_per_100g),
  };
}

function assertConsistent(data: FoodCreateInput | FoodUpdateInput): void {
  if (
    data.calories_per_100g === undefined ||
    data.protein_per_100g === undefined ||
    data.carbs_per_100g === undefined ||
    data.fats_per_100g === undefined
  ) {
    return;
  }
  const check = checkKcalConsistency(toPer100(data));
  if (!check.ok) {
    throw fail(
      'INCONSISTENT_KCAL',
      `kcal mismatch: declared ${check.declared} vs computed ${check.expected.toFixed(1)} from macros (tolerance ±15%)`
    );
  }
}

async function assertNoDuplicate(nameAr: string, nameEn: string | null | undefined, names: Array<{ name_ar: string; name_en: string | null }>, excludeId?: string, self?: FoodItem | null): Promise<void> {
  const candAr = normalizeFoodName(nameAr);
  const candEn = nameEn ? normalizeFoodName(nameEn) : '';
  for (const n of names) {
    if (excludeId && self && normalizeFoodName(self.name_ar) === normalizeFoodName(n.name_ar) && normalizeFoodName(n.name_ar) === candAr) continue;
    if (n.name_ar && normalizeFoodName(n.name_ar) === candAr && candAr !== '') {
      throw fail('DUPLICATE_FOOD', `An item named "${nameAr}" already exists`);
    }
    if (candEn !== '' && n.name_en && normalizeFoodName(n.name_en) === candEn) {
      throw fail('DUPLICATE_FOOD', `An item named "${nameEn}" already exists`);
    }
  }
}

export const foodsService = {
  async list(doctorId: string, query: FoodListQuery) {
    return foodsRepository.listVisible(doctorId, {
      search: query.search,
      category: query.category,
      tag: query.tag,
      scope: query.scope,
      includeArchived: query.include_archived === 'true',
      page: query.page,
      limit: query.limit,
    });
  },

  async listAdmin(adminId: string, query: FoodListQuery) {
    return foodsRepository.listForAdmin(adminId, {
      search: query.search,
      category: query.category,
      tag: query.tag,
      scope: query.scope,
      includeArchived: query.include_archived === 'true',
      page: query.page,
      limit: query.limit,
    });
  },

  async get(id: string, actorId: string, isAdmin: boolean) {
    const item = await foodsRepository.findById(id);
    if (!item || item.archived) return null;
    if (isAdmin) return item;
    if (item.owner_id !== null && item.owner_id !== actorId) return null;
    return item;
  },

  // FL-11: doctors create OWN items only; FL-14: consistency enforced on save.
  async create(actorId: string, data: FoodCreateInput, isAdmin: boolean): Promise<string> {
    assertConsistent(data);
    const names = isAdmin ? await foodsRepository.listGlobalNames() : await foodsRepository.listVisibleNames(actorId);
    await assertNoDuplicate(data.name_ar, data.name_en ?? null, names);
    const id = randomUUID();
    await foodsRepository.insert({
      id,
      nameAr: data.name_ar.trim(),
      nameEn: data.name_en?.trim() || null,
      caloriesPer100g: data.calories_per_100g,
      proteinPer100g: data.protein_per_100g,
      carbsPer100g: data.carbs_per_100g,
      fatsPer100g: data.fats_per_100g,
      category: data.category ?? null,
      tags: data.tags ?? null,
      pairingTags: data.pairing_tags ?? null,
      isVerified: isAdmin,
      ownerId: isAdmin ? null : actorId,
    });
    return id;
  },

  async update(id: string, actorId: string, patch: FoodUpdateInput, isAdmin: boolean): Promise<FoodItem | null> {
    const item = await foodsRepository.findById(id);
    if (!item) return null;
    if (isAdmin) {
      if (item.owner_id !== null) return null;
    } else {
      if (item.owner_id !== actorId) return null;
    }
    const merged = {
      name_ar: patch.name_ar ?? item.name_ar,
      name_en: patch.name_en !== undefined ? patch.name_en : item.name_en,
      calories_per_100g: patch.calories_per_100g ?? item.calories_per_100g,
      protein_per_100g: patch.protein_per_100g ?? item.protein_per_100g,
      carbs_per_100g: patch.carbs_per_100g ?? item.carbs_per_100g,
      fats_per_100g: patch.fats_per_100g ?? item.fats_per_100g,
    };
    assertConsistent({
      calories_per_100g: merged.calories_per_100g,
      protein_per_100g: merged.protein_per_100g,
      carbs_per_100g: merged.carbs_per_100g,
      fats_per_100g: merged.fats_per_100g,
    } as FoodUpdateInput);
    const names = isAdmin ? await foodsRepository.listGlobalNames() : await foodsRepository.listVisibleNames(actorId);
    if (patch.name_ar !== undefined || patch.name_en !== undefined) {
      await assertNoDuplicate(merged.name_ar, merged.name_en, names, id, item);
    }
    const repoPatch = {
      nameAr: patch.name_ar,
      nameEn: patch.name_en,
      caloriesPer100g: patch.calories_per_100g,
      proteinPer100g: patch.protein_per_100g,
      carbsPer100g: patch.carbs_per_100g,
      fatsPer100g: patch.fats_per_100g,
      category: patch.category,
      tags: patch.tags,
      pairingTags: patch.pairing_tags,
    };
    if (isAdmin) await foodsRepository.updateGlobal(id, repoPatch);
    else await foodsRepository.updateOwn(id, actorId, repoPatch);
    return foodsRepository.findById(id);
  },

  // FL-17: referenced items are archived, never hard-deleted.
  async remove(id: string, actorId: string, isAdmin: boolean): Promise<{ archived: boolean } | null> {
    const item = await foodsRepository.findById(id);
    if (!item) return null;
    if (isAdmin) {
      if (item.owner_id !== null) return null;
    } else {
      if (item.owner_id !== actorId) return null;
    }
    const refs = await foodsRepository.countPlanReferences(id);
    if (refs > 0) {
      await foodsRepository.setArchived(id, true);
      return { archived: true };
    }
    await foodsRepository.remove(id);
    return { archived: false };
  },

  // FL-03/12: row-level import with per-row report (FL-04 dupes skipped, FL-09 bad kcal rejected).
  async importRows(actorId: string, rows: ImportRow[], scope: 'global' | 'mine', isAdmin: boolean) {
    const targetGlobal = isAdmin && scope === 'global';
    const baseNames = targetGlobal ? await foodsRepository.listGlobalNames() : await foodsRepository.listVisibleNames(actorId);
    const seenInBatch: Array<{ name_ar: string; name_en: string | null }> = [];
    const rejected: Array<{ row: number; name: string; reason: string }> = [];
    const skipped: Array<{ row: number; name: string; reason: string }> = [];
    let imported = 0;
    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2;
      const issue = validateImportRow(rows[i], rowNumber, baseNames, seenInBatch);
      if (issue) {
        if (issue.reason.startsWith('Duplicate')) skipped.push(issue);
        else rejected.push(issue);
        continue;
      }
      const row = rows[i];
      await foodsRepository.insert({
        id: randomUUID(),
        nameAr: row.name_ar.trim(),
        nameEn: row.name_en?.trim() || null,
        caloriesPer100g: row.calories_per_100g,
        proteinPer100g: row.protein_per_100g,
        carbsPer100g: row.carbs_per_100g,
        fatsPer100g: row.fats_per_100g,
        category: row.category?.trim() || null,
        tags: row.tags ?? null,
        pairingTags: row.pairing_tags ?? null,
        isVerified: targetGlobal,
        ownerId: targetGlobal ? null : actorId,
      });
      seenInBatch.push({ name_ar: row.name_ar, name_en: row.name_en ?? null });
      imported += 1;
    }
    return { imported, skipped, rejected, total: rows.length };
  },
};
