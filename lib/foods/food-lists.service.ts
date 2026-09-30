import { randomUUID } from 'crypto';
import { foodListsRepository } from '@/lib/db/repositories/food-lists.repo';
import { foodsRepository } from '@/lib/db/repositories/foods.repo';
import { serviceFail as fail } from '@/lib/errors/fail';
import type { FoodListCreateInput } from './foods.schema';

export const foodListsService = {
  async list(doctorId: string) {
    return foodListsRepository.listVisible(doctorId);
  },

  async listAdmin() {
    return foodListsRepository.listAllForAdmin();
  },

  async create(actorId: string, data: FoodListCreateInput, isAdmin: boolean): Promise<string> {
    const id = randomUUID();
    await foodListsRepository.insert({
      id,
      nameAr: data.name_ar.trim(),
      nameEn: data.name_en?.trim() || null,
      descriptionAr: data.description_ar ?? null,
      descriptionEn: data.description_en ?? null,
      ownerId: isAdmin ? null : actorId,
      isGlobal: isAdmin,
    });
    if (data.food_ids && data.food_ids.length > 0) {
      let order = 0;
      for (const foodId of data.food_ids) {
        const food = await foodsRepository.findById(foodId);
        if (!food || food.archived) continue;
        if (!isAdmin && food.owner_id !== null && food.owner_id !== actorId) continue;
        await foodListsRepository.addItem(randomUUID(), id, foodId, order++);
      }
    }
    return id;
  },

  async get(id: string, actorId: string, isAdmin: boolean) {
    const list = await foodListsRepository.findById(id);
    if (!list) return null;
    if (!isAdmin && !list.is_global && list.owner_id !== actorId) return null;
    const items = await foodListsRepository.listItems(id);
    return { ...list, items };
  },

  async update(id: string, actorId: string, patch: Partial<FoodListCreateInput>, isAdmin: boolean): Promise<boolean> {
    const list = await foodListsRepository.findById(id);
    if (!list) return false;
    if (isAdmin) {
      if (!list.is_global && list.owner_id !== null) return false;
    } else {
      if (list.owner_id !== actorId) return false;
    }
    await foodListsRepository.update(id, {
      nameAr: patch.name_ar,
      nameEn: patch.name_en,
      descriptionAr: patch.description_ar,
      descriptionEn: patch.description_en,
    });
    return true;
  },

  async remove(id: string, actorId: string, isAdmin: boolean): Promise<boolean> {
    const list = await foodListsRepository.findById(id);
    if (!list) return false;
    if (isAdmin) {
      if (!list.is_global && list.owner_id !== null) return false;
    } else {
      if (list.owner_id !== actorId) return false;
    }
    await foodListsRepository.remove(id);
    return true;
  },

  // FL-13: copy a public list as an editable private base (items cloned as own).
  async copyAsBase(doctorId: string, listId: string): Promise<{ listId: string; copied: number } | null> {
    const list = await foodListsRepository.findById(listId);
    if (!list || (!list.is_global && list.owner_id !== null)) return null;
    const members = await foodListsRepository.listItems(listId);
    const newListId = randomUUID();
    await foodListsRepository.insert({
      id: newListId,
      nameAr: `${list.name_ar} (نسختي)`,
      nameEn: list.name_en ? `${list.name_en} (my copy)` : null,
      descriptionAr: list.description_ar,
      descriptionEn: list.description_en,
      ownerId: doctorId,
      isGlobal: false,
    });
    let copied = 0;
    for (const m of members) {
      const food = await foodsRepository.findById(m.food_id);
      if (!food || food.archived) continue;
      const copyId = randomUUID();
      await foodsRepository.insert({
        id: copyId,
        nameAr: food.name_ar,
        nameEn: food.name_en,
        caloriesPer100g: food.calories_per_100g,
        proteinPer100g: food.protein_per_100g,
        carbsPer100g: food.carbs_per_100g,
        fatsPer100g: food.fats_per_100g,
        category: food.category,
        tags: food.tags,
        pairingTags: food.pairing_tags,
        isVerified: false,
        ownerId: doctorId,
      });
      await foodListsRepository.addItem(randomUUID(), newListId, copyId, copied);
      copied += 1;
    }
    if (copied === 0) throw fail('EMPTY_LIST', 'Public list has no usable items to copy');
    return { listId: newListId, copied };
  },
};
