'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Tile, Tag, InlineNotification } from '@carbon/react';
import { Checkmark, Add, TrashCan } from '@carbon/icons-react';
import { useTranslations } from 'next-intl';
import MealBlock, { type FoodOption } from './_components/meal-block';
import BulkModal, { type UndoRef } from './_components/bulk-modal';
import RevisionsPanel from './_components/revisions-panel';
import { dayTotals, cid, type EditMeal, type Per100Map } from './_components/editor-types';

interface PlanRow {
  id: string;
  patient_id: string;
  status: string;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fats_g: number;
}

import { readApi } from '@/lib/api/fetch-json';

function statusTag(status: string): 'red' | 'blue' | 'green' | 'cool-gray' {
  if (status === 'active') return 'green';
  if (status === 'pending_doctor_approval') return 'blue';
  if (status === 'archived') return 'red';
  return 'cool-gray';
}

function statusLabel(t: (k: string) => string, status: string): string {
  if (status === 'active') return t('statusActive');
  if (status === 'pending_doctor_approval') return t('statusPending');
  if (status === 'archived') return t('statusArchived');
  return t('statusDraft');
}

export default function PlanEditorPage() {
  const t = useTranslations('plans');
  const params = useParams();
  const router = useRouter();
  const planId = String(params.id);
  const locale = String(params.locale);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [meals, setMeals] = useState<EditMeal[]>([]);
  const [weeks, setWeeks] = useState<Array<{ id: string; week_number: number; status: string }>>([]);
  const [targets, setTargets] = useState({ calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAnchor, setBulkAnchor] = useState<{ itemId: string | null; mealId: string | null }>({ itemId: null, mealId: null });
  const [undoRefs, setUndoRefs] = useState<UndoRef[]>([]);
  const [deviationAlert, setDeviationAlert] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await readApi<{
        plan: PlanRow;
        meals: Array<{ meal: { id: string; day_of_week: number; meal_name: string }; items: Array<{ id: string; food_id: string | null; food_name_ar: string; food_name_en: string | null; source: 'db' | 'model'; grams: number; protein_g: number; carbs_g: number; fats_g: number; calories: number }> }>;
        per100: Per100Map;
      }>(await fetch(`/api/plans/${planId}`));
      setPlan(data.plan);
      setTargets({ calories: Number(data.plan.target_calories), proteinG: Number(data.plan.target_protein_g), carbsG: Number(data.plan.target_carbs_g), fatsG: Number(data.plan.target_fats_g) });
      setMeals(
        data.meals.map((m) => ({
          clientId: cid('meal'),
          mealId: m.meal.id,
          day: Number(m.meal.day_of_week),
          mealName: String(m.meal.meal_name),
          items: m.items.map((row) => {
            const grams = Number(row.grams);
            const per100 = row.food_id && data.per100[row.food_id]
              ? data.per100[row.food_id]
              : (() => {
                  const f = grams > 0 ? 100 / grams : 0;
                  return { kcal: Number(row.calories) * f, protein: Number(row.protein_g) * f, carbs: Number(row.carbs_g) * f, fats: Number(row.fats_g) * f };
                })();
            return {
              clientId: cid('item'), rowId: row.id, foodId: row.food_id,
              nameAr: row.food_name_ar, nameEn: row.food_name_en, source: row.source,
              grams: String(grams), per100,
            };
          }),
        }))
      );
      const weekList = await readApi<{ plans: Array<{ id: string; week_number: number; status: string }> }>(
        await fetch(`/api/plans?patient_id=${data.plan.patient_id}&limit=100`)
      );
      setWeeks(weekList.plans.map((w) => ({ id: String(w.id), week_number: Number(w.week_number), status: String(w.status) })));
      setDirty(false);
      setError(null);
    } catch {
      setError(t('loadFailed'));
    }
  }, [planId, t]);

  useEffect(() => {
    load();
  }, [load]);

  function mutate(updater: (prev: EditMeal[]) => EditMeal[]): void {
    setMeals(updater);
    setDirty(true);
  }

  function setGrams(clientId: string, grams: string): void {
    mutate((prev) => prev.map((m) => ({ ...m, items: m.items.map((i) => (i.clientId === clientId ? { ...i, grams } : i)) })));
  }

  function removeItem(clientId: string): void {
    mutate((prev) => prev.map((m) => ({ ...m, items: m.items.filter((i) => i.clientId !== clientId) })).filter((m) => m.items.length > 0));
  }

  function swapItem(clientId: string, food: FoodOption): void {
    mutate((prev) =>
      prev.map((m) => ({
        ...m,
        items: m.items.map((i) =>
          i.clientId === clientId
            ? {
                ...i, rowId: null, foodId: food.id, nameAr: food.name_ar, nameEn: food.name_en, source: 'db' as const,
                per100: { kcal: Number(food.calories_per_100g), protein: Number(food.protein_per_100g), carbs: Number(food.carbs_per_100g), fats: Number(food.fats_per_100g) },
              }
            : i
        ),
      }))
    );
  }

  function addItem(mealClientId: string, food: FoodOption, grams: string): void {
    mutate((prev) =>
      prev.map((m) =>
        m.clientId === mealClientId
          ? {
              ...m,
              items: [...m.items, {
                clientId: cid('item'), rowId: null, foodId: food.id, nameAr: food.name_ar, nameEn: food.name_en,
                source: 'db' as const, grams,
                per100: { kcal: Number(food.calories_per_100g), protein: Number(food.protein_per_100g), carbs: Number(food.carbs_per_100g), fats: Number(food.fats_per_100g) },
              }],
            }
          : m
      )
    );
  }

  function moveItem(draggedId: string, targetMealClientId: string): void {
    mutate((prev) => {
      let dragged: EditMeal['items'][number] | null = null;
      const stripped = prev.map((m) => ({ ...m, items: m.items.filter((i) => {
        if (i.clientId === draggedId) {
          dragged = i;
          return false;
        }
        return true;
      }) }));
      if (!dragged) return prev;
      return stripped.map((m) => (m.clientId === targetMealClientId ? { ...m, items: [...m.items, dragged as EditMeal['items'][number]] } : m));
    });
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const data = await readApi<{ deviationKcal: number; status: string; warnings: string[] }>(
        await fetch(`/api/plans/${planId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_calories: targets.calories,
            target_protein_g: targets.proteinG,
            target_carbs_g: targets.carbsG,
            target_fats_g: targets.fatsG,
            meals: meals.map((m) => ({
              day: m.day,
              meal_name: m.mealName,
              items: m.items.map((i) => ({
                id: i.rowId ?? undefined,
                food_id: i.foodId ?? undefined,
                food_name_ar: i.nameAr,
                grams: Number(i.grams) || 0,
              })),
            })),
          }),
        })
      );
      setWarnings(data.warnings);
      setNotice(t('planSaved'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function approve(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const data = await readApi<{ warnings: string[] }>(
        await fetch(`/api/plans/${planId}/approve`, { method: 'POST' })
      );
      setWarnings(data.warnings);
      setNotice(t('planActive'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function adaptive(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await readApi(await fetch(`/api/plans/${planId}/adaptive-recompute`, { method: 'POST' }));
      setNotice(t('adaptiveDone'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function undo(): Promise<void> {
    setBusy(true);
    try {
      for (const ref of undoRefs) {
        await readApi(
          await fetch(`/api/plans/${ref.planId}/restore-revision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ revision_no: ref.revisionNo }),
          })
        );
      }
      setUndoRefs([]);
      setDeviationAlert(false);
      setNotice(t('undoDone'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function addWeek(): Promise<void> {
    try {
      const data = await readApi<{ planId: string }>(
        await fetch(`/api/plans/${planId}/clone-week`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      );
      router.push(`/${locale}/dashboard/plans/${data.planId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    }
  }

  async function deleteWeek(): Promise<void> {
    if (!window.confirm(t('deleteWeekConfirm'))) return;
    try {
      await readApi(await fetch(`/api/plans/${planId}`, { method: 'DELETE' }));
      const remaining = weeks.filter((w) => w.id !== planId);
      if (remaining.length > 0) router.push(`/${locale}/dashboard/plans/${remaining[0].id}`);
      else router.push(`/${locale}/dashboard`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    }
  }

  if (!plan) return <div>{error ?? t('editor')}</div>;
  const days = [...new Set(meals.map((m) => m.day))].sort((a, b) => a - b);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1>{t('editor')}</h1>
        <Tag type={statusTag(plan.status)}>{statusLabel(t, plan.status)}</Tag>
        {dirty && <Tag type="blue">{t('unsavedChanges')}</Tag>}
      </div>
      {error && <InlineNotification kind="error" title={error} hideCloseButton lowContrast />}
      {notice && <InlineNotification kind="success" title={notice} hideCloseButton lowContrast onCloseButtonClick={() => setNotice(null)} />}
      {warnings.map((w, k) => (
        <InlineNotification key={k} kind="warning" title={w} hideCloseButton lowContrast />
      ))}
      {deviationAlert && <InlineNotification kind="warning" title={t('deviationAlert', { pct: 2 })} hideCloseButton lowContrast />}

      <Tile>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{t('week')}:</span>
          {weeks.map((w) => (
            <Button
              key={w.id}
              kind={w.id === planId ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => w.id !== planId && router.push(`/${locale}/dashboard/plans/${w.id}`)}
            >
              {w.week_number}
            </Button>
          ))}
          <Button kind="tertiary" size="sm" renderIcon={Add} onClick={addWeek}>
            {t('addWeek')}
          </Button>
          <Button kind="danger--ghost" size="sm" renderIcon={TrashCan} onClick={deleteWeek}>
            {t('deleteWeek')}
          </Button>
        </div>
      </Tile>

      <Tile>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button kind="primary" size="sm" renderIcon={Checkmark} disabled={busy || !dirty} onClick={save}>
            {t('savePlan')}
          </Button>
          <Button kind="secondary" size="sm" renderIcon={Checkmark} disabled={busy || plan.status === 'active'} onClick={approve}>
            {t('approvePublish')}
          </Button>
          <Button kind="tertiary" size="sm" disabled={busy} onClick={adaptive}>
            {t('adaptive')}
          </Button>
          {undoRefs.length > 0 && (
            <Button kind="ghost" size="sm" disabled={busy} onClick={undo}>
              {t('undo')}
            </Button>
          )}
        </div>
      </Tile>

      {days.map((day) => {
        const total = dayTotals(meals, day);
        const dev = targets.calories > 0 ? Math.abs(total.calories - targets.calories) / targets.calories : 0;
        return (
          <div key={day} style={{ display: 'grid', gap: 12 }}>
            <h3>
              {t('dayTotal')} {day}: {total.calories} kcal
              {dev > 0.02 && <Tag type="red">±{(dev * 100).toFixed(1)}%</Tag>}
            </h3>
            {meals.filter((m) => m.day === day).map((meal) => (
              <MealBlock
                key={meal.clientId}
                meal={meal}
                onGrams={setGrams}
                onRemove={removeItem}
                onSwap={swapItem}
                onAdd={addItem}
                onMoveItem={moveItem}
                onDragStart={() => {}}
                onBulk={(item, parentMeal) => {
                  if (item.rowId && parentMeal.mealId) {
                    setBulkAnchor({ itemId: item.rowId, mealId: parentMeal.mealId });
                    setBulkOpen(true);
                  }
                }}
              />
            ))}
          </div>
        );
      })}

      <BulkModal
        planId={planId}
        anchorItemId={bulkAnchor.itemId}
        anchorMealId={bulkAnchor.mealId}
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onApplied={(undo, alert) => {
          setUndoRefs(undo);
          setDeviationAlert(alert);
          setNotice(t('bulkApplied'));
          load();
        }}
      />
      <RevisionsPanel planId={planId} onRestored={load} />
    </div>
  );
}
