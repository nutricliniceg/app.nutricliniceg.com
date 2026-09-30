'use client';

import { useState } from 'react';
import { Button, Modal, Select, SelectItem, TextInput, Checkbox, Tag } from '@carbon/react';
import { useTranslations } from 'next-intl';
import type { FoodOption } from './meal-block';

export interface BulkPosition {
  planId: string;
  day: number;
  mealId: string;
  mealName: string;
  itemId: string;
  foodKey: string;
  foodName: string;
  grams: number;
}

export interface UndoRef {
  planId: string;
  revisionNo: number;
}

import { readApi } from '@/lib/api/fetch-json';

async function searchFoods(query: string): Promise<FoodOption[]> {
  const res = await fetch(`/api/foods?search=${encodeURIComponent(query)}&limit=20`);
  const body = (await res.json()) as { success: boolean; data: { items: FoodOption[] } };
  if (!body.success) return [];
  return body.data.items;
}

export default function BulkModal({ planId, anchorItemId, anchorMealId, open, onClose, onApplied }: {
  planId: string;
  anchorItemId: string | null;
  anchorMealId: string | null;
  open: boolean;
  onClose: () => void;
  onApplied: (undo: UndoRef[], alert: boolean) => void;
}) {
  const t = useTranslations('plans');
  const c = useTranslations('common');
  const [scope, setScope] = useState('week');
  const [opType, setOpType] = useState<'set_grams' | 'swap_food'>('set_grams');
  const [grams, setGrams] = useState('200');
  const [swapId, setSwapId] = useState('');
  const [swapOptions, setSwapOptions] = useState<FoodOption[]>([]);
  const [positions, setPositions] = useState<BulkPosition[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function preview(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const data = await readApi<{ count: number; positions: BulkPosition[] }>(
        await fetch(`/api/plans/${planId}/bulk-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope,
            anchor: { meal_id: anchorMealId, item_id: anchorItemId },
            op: opType === 'set_grams' ? { type: 'set_grams', grams: Number(grams) } : { type: 'swap_food', food_id: swapId },
            exclusions: excluded,
            preview: true,
          }),
        })
      );
      setPositions(data.positions);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function apply(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const data = await readApi<{ undo: UndoRef[]; plans: Array<{ deviationAlert: boolean }> }>(
        await fetch(`/api/plans/${planId}/bulk-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope,
            anchor: { meal_id: anchorMealId, item_id: anchorItemId },
            op: opType === 'set_grams' ? { type: 'set_grams', grams: Number(grams) } : { type: 'swap_food', food_id: swapId },
            exclusions: excluded,
            preview: false,
          }),
        })
      );
      onApplied(data.undo, data.plans.some((p) => p.deviationAlert));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    } finally {
      setBusy(false);
    }
  }

  function toggleExclude(itemId: string, checked: boolean): void {
    setExcluded((prev) => (checked ? prev.filter((id) => id !== itemId) : [...prev, itemId]));
  }

  return (
    <Modal
      open={open}
      modalHeading={t('bulkEdit')}
      primaryButtonText={t('applyBulk')}
      secondaryButtonText={c('cancel')}
      onRequestClose={onClose}
      onRequestSubmit={apply}
      primaryButtonDisabled={busy || (opType === 'swap_food' && swapId === '')}
    >
      <Select id="bulk-scope" labelText={t('bulkScope')} value={scope} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScope(e.target.value)}>
        <SelectItem value="meal" text={t('scopeMeal')} />
        <SelectItem value="day" text={t('scopeDay')} />
        <SelectItem value="week" text={t('scopeWeek')} />
        <SelectItem value="all-weeks" text={t('scopeAllWeeks')} />
      </Select>
      <Select id="bulk-op" labelText={t('bulkOp')} value={opType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOpType(e.target.value as 'set_grams' | 'swap_food')}>
        <SelectItem value="set_grams" text={t('opSetGrams')} />
        <SelectItem value="swap_food" text={t('opSwap')} />
      </Select>
      {opType === 'set_grams' ? (
        <TextInput id="bulk-grams" labelText={t('newGrams')} value={grams} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGrams(e.target.value)} inputMode="decimal" />
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <TextInput
            id="bulk-swap-q"
            labelText={t('searchFoods')}
            value=""
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              if (e.target.value.trim().length >= 2) searchFoods(e.target.value.trim()).then(setSwapOptions);
            }}
          />
          <Select id="bulk-swap-s" labelText={t('replacementFood')} value={swapId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSwapId(e.target.value)}>
            <SelectItem value="" text="—" />
            {swapOptions.map((o) => (
              <SelectItem key={o.id} value={o.id} text={o.name_ar} />
            ))}
          </Select>
        </div>
      )}
      <Button kind="tertiary" size="sm" disabled={busy} onClick={preview} style={{ marginTop: 8 }}>
        {t('previewAffected')}
      </Button>
      {positions.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p>{t('affectedCount', { n: positions.length })} — {t('exclude')}:</p>
          {positions.map((p) => (
            <p key={p.itemId}>
              <Checkbox
                id={`ex-${p.itemId}`}
                labelText={`${p.foodName} (${t('week')} ${p.day} · ${p.mealName} · ${p.grams}g)`}
                checked={!excluded.includes(p.itemId)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => toggleExclude(p.itemId, e.target.checked)}
              />
            </p>
          ))}
        </div>
      )}
      {error && <p><Tag type="red">{error}</Tag></p>}
    </Modal>
  );
}
