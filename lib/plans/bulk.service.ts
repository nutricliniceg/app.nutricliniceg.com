import { foodsRepository } from '@/lib/db/repositories/foods.repo';
import { plansRepository, planRevisionsRepository } from '@/lib/db/repositories/plans.repo';
import { reconcile } from '@/lib/nutrition/reconciler';
import { previewItemValues } from './day-items';
import { enrichRows, visibleFoodIdSet, dayTotalKcal, type EnrichedDay } from './enrich';
import { resolvePositions, needsAutoReconcile, foodKeyOf, type BulkScope, type ScopePlan } from './bulk';
import { buildSnapshot } from './revisions';
import { fail } from './errors';
import type { BulkEditInput } from './editor.schema';
import type { Targets } from './types';

function toScopePlans(
  plans: Array<{ planId: string; days: EnrichedDay[] }>
): ScopePlan[] {
  return plans.map((p) => ({
    planId: p.planId,
    meals: p.days.map((d) => ({
      mealId: d.mealId ?? `${p.planId}:${d.day}`,
      day: d.day,
      mealName: d.mealName,
      items: d.items.map((i) => ({
        itemId: i.rowId ?? `${d.mealId}:${i.foodId ?? i.nameAr}`,
        foodKey: i.foodId ?? foodKeyOf(null, i.nameAr),
        foodName: i.nameAr,
        grams: i.grams,
      })),
    })),
  }));
}

async function planTargets(planId: string, doctorId: string): Promise<{ plan: Record<string, unknown>; targets: Targets }> {
  const plan = await plansRepository.findOwnedById(planId, doctorId);
  if (!plan) throw fail('NOT_FOUND', 'Plan not found');
  const p = plan as { target_calories: number; target_protein_g: number; target_carbs_g: number; target_fats_g: number };
  return {
    plan,
    targets: { calories: Number(p.target_calories), proteinG: Number(p.target_protein_g), carbsG: Number(p.target_carbs_g), fatsG: Number(p.target_fats_g), railsClamped: false },
  };
}

export const bulkService = {
  // NP-14/15: preview returns affected positions (count + rows + exclusions
  // honored); apply performs with pre/post revisions. Undo = restore the
  // returned pre-apply revision via POST .../restore-revision (NP-17).
  async bulkEdit(planId: string, doctorId: string, input: BulkEditInput, isAdmin: boolean) {
    const anchor = await plansRepository.findOwnedById(planId, doctorId);
    if (!anchor) return null;
    if (String((anchor as { status: string }).status) === 'archived') {
      throw fail('ARCHIVED', 'Archived plans cannot be edited');
    }
    const patientId = String((anchor as { patient_id: string }).patient_id);
    const scope = input.scope as BulkScope;
    const planIds = scope === 'all-weeks'
      ? (await plansRepository.listByPatient(doctorId, patientId))
          .filter((p) => String((p as { status: string }).status) !== 'archived')
          .map((p) => String((p as { id: string }).id))
      : [planId];
    if (!planIds.includes(planId)) planIds.push(planId);

    const enriched = new Map<string, { days: EnrichedDay[]; targets: Targets; plan: Record<string, unknown> }>();
    for (const pid of planIds) {
      const full = await plansRepository.getFullPlan(pid, doctorId);
      if (!full) continue;
      const { targets, plan } = await planTargets(pid, doctorId);
      const { days } = await enrichRows(full, null);
      enriched.set(pid, { days, targets, plan });
    }
    const scopePlans = toScopePlans([...enriched].map(([pid, e]) => ({ planId: pid, days: e.days })));
    const positions = resolvePositions(scopePlans, scope, {
      mealId: input.anchor.meal_id,
      itemId: input.anchor.item_id,
      foodKey: input.anchor.food_key,
    }, input.exclusions ?? []);

    if (input.preview) {
      return { preview: true as const, count: positions.length, positions };
    }
    if (positions.length === 0) {
      throw fail('NO_POSITIONS', 'No matching positions for this scope — check the anchor item and exclusions');
    }

    // Resolve swap target once (visibility-checked).
    let swapFood: { id: string; nameAr: string; nameEn: string | null; per100: { kcal: number; protein: number; carbs: number; fats: number; potassiumMg: number | null; phosphorusMg: number | null; sodiumMg: number | null; addedSugarG: number | null }; category: string | null; tags: string[] } | null = null;
    if (input.op.type === 'swap_food') {
      const visible = await visibleFoodIdSet(doctorId, isAdmin);
      const food = await foodsRepository.findById(input.op.food_id);
      if (!food || food.archived || (visible && !visible.has(food.id))) {
        throw fail('INVALID_FOOD', 'Replacement food is not in your allowed scope');
      }
      swapFood = {
        id: food.id, nameAr: food.name_ar, nameEn: food.name_en,
        per100: {
          kcal: Number(food.calories_per_100g), protein: Number(food.protein_per_100g),
          carbs: Number(food.carbs_per_100g), fats: Number(food.fats_per_100g),
          potassiumMg: food.potassium_mg_per_100g, phosphorusMg: food.phosphorus_mg_per_100g,
          sodiumMg: food.sodium_mg_per_100g, addedSugarG: food.added_sugar_g_per_100g,
        },
        category: food.category, tags: food.tags ?? [],
      };
    }

    const undo: Array<{ planId: string; revisionNo: number }> = [];
    const plans: Array<{ planId: string; affected: number; deviationAlert: boolean; deviationKcal: number; reconciled: boolean }> = [];
    const byPlan = new Map<string, typeof positions>();
    for (const pos of positions) {
      const list = byPlan.get(pos.planId) ?? [];
      list.push(pos);
      byPlan.set(pos.planId, list);
    }

    for (const [pid, list] of byPlan) {
      const entry = enriched.get(pid);
      if (!entry) continue;
      // Pre-apply revision (undo anchor, NP-17).
      const full = await plansRepository.getFullPlan(pid, doctorId);
      const preNo = await planRevisionsRepository.nextRevisionNo(pid);
      if (full) {
        await planRevisionsRepository.insert({
          planType: 'nutrition', planId: pid, revisionNo: preNo,
          snapshot: buildSnapshot(full, entry.targets, 'pre-bulk'),
          changedBy: doctorId, changeNote: 'Pre-bulk backup (undo anchor)',
        });
        undo.push({ planId: pid, revisionNo: preNo });
      }
      // Working copy: itemId → { grams, per100, foodId, name }.
      const working = new Map<string, { grams: number; per100: EnrichedDay['items'][number]['per100']; foodId: string | null; nameAr: string; nameEn: string | null; source: 'db' | 'model' }>();
      for (const day of entry.days) {
        for (const item of day.items) {
          if (item.rowId) {
            working.set(item.rowId, { grams: item.grams, per100: item.per100, foodId: item.foodId, nameAr: item.nameAr, nameEn: item.nameEn ?? null, source: item.source });
          }
        }
      }
      const touchedItemIds = new Set<string>();
      for (const pos of list) {
        const w = working.get(pos.itemId);
        if (!w) continue;
        if (input.op.type === 'set_grams') {
          w.grams = input.op.grams;
        } else if (swapFood) {
          w.foodId = swapFood.id;
          w.nameAr = swapFood.nameAr;
          w.nameEn = swapFood.nameEn;
          w.per100 = swapFood.per100;
          w.source = 'db';
        }
        touchedItemIds.add(pos.itemId);
      }
      // Recompute affected days → deviation alert (> ±2%) → auto-reconcile.
      const affectedDays = [...new Set(list.map((p) => p.day))];
      let deviationAlert = false;
      let reconciled = false;
      for (const day of affectedDays) {
        const dayItems = entry.days.find((d) => d.day === day)?.items ?? [];
        const merged = dayItems.map((i) => {
          const w = i.rowId ? working.get(i.rowId) : undefined;
          return { grams: w?.grams ?? i.grams, per100: w?.per100 ?? i.per100 };
        });
        const total = dayTotalKcal(merged);
        if (needsAutoReconcile(total, entry.targets.calories)) deviationAlert = true;
        // NP-16: pull the day back to target with the reconciler.
        const rec = reconcile(entry.targets.calories, {
          proteinG: entry.targets.proteinG, carbsG: entry.targets.carbsG, fatsG: entry.targets.fatsG,
        }, merged.map((m, k) => ({
          foodId: `bulk:${day}:${k}`, name: 'bulk', grams: m.grams,
          per100: { kcal: m.per100.kcal, protein: m.per100.protein, carbs: m.per100.carbs, fats: m.per100.fats },
        })));
        if (rec.status === 'accepted') {
          reconciled = true;
          // Map reconciled grams back onto working rows of this day.
          const dayRows = entry.days.find((d) => d.day === day)?.items ?? [];
          dayRows.forEach((row, k) => {
            const target = rec.items[k];
            if (row.rowId && target && working.has(row.rowId)) {
              const entry2 = working.get(row.rowId) as { grams: number };
              entry2.grams = target.grams;
            }
          });
        }
      }
      // Persist touched rows (server-side recompute via preview math).
      for (const itemId of touchedItemIds) {
        const w = working.get(itemId);
        if (!w) continue;
        const v = previewItemValues(
          { kcal: w.per100.kcal, protein: w.per100.protein, carbs: w.per100.carbs, fats: w.per100.fats },
          w.grams
        );
        await plansRepository.updateMealItemValues(itemId, {
          foodId: w.foodId, source: w.source, grams: v.grams,
          proteinG: v.proteinG, carbsG: v.carbsG, fatsG: v.fatsG, calories: v.calories,
        });
      }
      // Also persist reconciled grams for untouched rows of reconciled days.
      for (const day of affectedDays) {
        const dayRows = entry.days.find((d) => d.day === day)?.items ?? [];
        for (const row of dayRows) {
          if (!row.rowId || touchedItemIds.has(row.rowId)) continue;
          const w = working.get(row.rowId);
          if (!w) continue;
          const v = previewItemValues(
            { kcal: w.per100.kcal, protein: w.per100.protein, carbs: w.per100.carbs, fats: w.per100.fats },
            w.grams
          );
          if (Math.abs(v.grams - row.grams) > 1e-9) {
            await plansRepository.updateMealItemValues(row.rowId, {
              foodId: w.foodId, source: w.source, grams: v.grams,
              proteinG: v.proteinG, carbsG: v.carbsG, fatsG: v.fatsG, calories: v.calories,
            });
          }
        }
      }
      // Refresh day-1 template fields for approval gating.
      const dayOne = entry.days.find((d) => d.day === 1) ?? entry.days[0];
      const refreshed = dayOne.items.map((i) => {
        const w = i.rowId ? working.get(i.rowId) : undefined;
        return { grams: w?.grams ?? i.grams, per100: w?.per100 ?? i.per100 };
      });
      const dayTotal = dayTotalKcal(refreshed);
      const deviationKcal = Math.abs(dayTotal - entry.targets.calories);
      await plansRepository.updateReconciled(pid, doctorId, {
        reconciledTotalCalories: Math.round(dayTotal),
        reconciledProteinG: Math.round(refreshed.reduce((s, i) => s + (i.per100.protein * i.grams) / 100, 0)),
        reconciledCarbsG: Math.round(refreshed.reduce((s, i) => s + (i.per100.carbs * i.grams) / 100, 0)),
        reconciledFatsG: Math.round(refreshed.reduce((s, i) => s + (i.per100.fats * i.grams) / 100, 0)),
        deviationKcal: Math.round(deviationKcal * 100) / 100,
        reconciledAt: new Date(),
      });
      const postNo = await planRevisionsRepository.nextRevisionNo(pid);
      const postFull = await plansRepository.getFullPlan(pid, doctorId);
      if (postFull) {
        await planRevisionsRepository.insert({
          planType: 'nutrition', planId: pid, revisionNo: postNo,
          snapshot: buildSnapshot(postFull, entry.targets, 'post-bulk'),
          changedBy: doctorId, changeNote: input.change_note ?? 'Bulk apply',
        });
      }
      plans.push({ planId: pid, affected: list.length, deviationAlert, deviationKcal: Math.round(deviationKcal * 100) / 100, reconciled });
    }
    return { applied: true as const, plans, undo };
  },
};
