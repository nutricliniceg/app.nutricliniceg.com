'use client';

import { useState } from 'react';
import { Button, Tile, TextInput, Select, SelectItem, Tag } from '@carbon/react';
import { TrashCan } from '@carbon/icons-react';
import { useTranslations } from 'next-intl';
import { mealTotals, type EditMeal, type EditItem } from './editor-types';

export interface FoodOption {
  id: string;
  name_ar: string;
  name_en: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
}

async function searchFoods(query: string): Promise<FoodOption[]> {
  const res = await fetch(`/api/foods?search=${encodeURIComponent(query)}&limit=20`);
  const body = (await res.json()) as { success: boolean; data: { items: FoodOption[] } };
  if (!body.success) return [];
  return body.data.items;
}

function SwapBox({ idPrefix, onPick }: { idPrefix: string; onPick: (food: FoodOption) => void }) {
  const t = useTranslations('plans');
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<FoodOption[]>([]);
  const [picked, setPicked] = useState('');

  async function runSearch(value: string): Promise<void> {
    setQuery(value);
    if (value.trim().length < 2) {
      setOptions([]);
      return;
    }
    setOptions(await searchFoods(value.trim()));
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <TextInput
        id={`swap-q-${idPrefix}`}
        labelText={t('searchFoods')}
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => runSearch(e.target.value)}
      />
      <Select
        id={`swap-s-${idPrefix}`}
        labelText={t('swapFood')}
        value={picked}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          setPicked(e.target.value);
          const food = options.find((o) => o.id === e.target.value);
          if (food) onPick(food);
        }}
      >
        <SelectItem value="" text="—" />
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} text={`${o.name_ar}${o.name_en ? ` / ${o.name_en}` : ''}`} />
        ))}
      </Select>
    </div>
  );
}

export default function MealBlock({ meal, onGrams, onRemove, onSwap, onAdd, onMoveItem, onDragStart, onBulk }: {
  meal: EditMeal;
  onGrams: (clientId: string, grams: string) => void;
  onRemove: (clientId: string) => void;
  onSwap: (clientId: string, food: FoodOption) => void;
  onAdd: (mealClientId: string, food: FoodOption, grams: string) => void;
  onMoveItem: (draggedId: string, targetMealClientId: string) => void;
  onDragStart: (clientId: string) => void;
  onBulk: (item: EditItem, meal: EditMeal) => void;
}) {
  const t = useTranslations('plans');
  const totals = mealTotals(meal);
  const [addGrams, setAddGrams] = useState('100');

  return (
    <Tile
      onDragOver={(e: React.DragEvent) => e.preventDefault()}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault();
        const dragged = e.dataTransfer.getData('text/plan-item');
        if (dragged) onMoveItem(dragged, meal.clientId);
      }}
    >
      <h4>
        {meal.mealName} — {t('mealTotal')}: {totals.calories} kcal
      </h4>
      {meal.items.map((item: EditItem) => (
        <div
          key={item.clientId}
          draggable
          onDragStart={(e: React.DragEvent) => {
            e.dataTransfer.setData('text/plan-item', item.clientId);
            onDragStart(item.clientId);
          }}
          style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8, padding: 8, border: '1px dashed #c6c6c6' }}
          title={t('moveHint')}
        >
          <span style={{ minWidth: 140 }}>
            {item.source === 'model' && <Tag type="red">{t('unverifiedBadge')}</Tag>} {item.nameAr}
          </span>
          <TextInput
            id={`g-${item.clientId}`}
            labelText={t('grams')}
            value={item.grams}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onGrams(item.clientId, e.target.value)}
            inputMode="decimal"
          />
          <Button kind="ghost" size="sm" renderIcon={TrashCan} onClick={() => onRemove(item.clientId)} aria-label={t('removeItem')} />
          {item.rowId && meal.mealId && (
            <Button kind="ghost" size="sm" onClick={() => onBulk(item, meal)}>
              {t('bulkEdit')}
            </Button>
          )}
          <SwapBox idPrefix={`sw-${item.clientId}`} onPick={(food) => onSwap(item.clientId, food)} />
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <p>{t('addItem')}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextInput
            id={`add-g-${meal.clientId}`}
            labelText={t('grams')}
            value={addGrams}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddGrams(e.target.value)}
            inputMode="decimal"
          />
          <SwapBox idPrefix={`add-${meal.clientId}`} onPick={(food) => onAdd(meal.clientId, food, addGrams)} />
        </div>
      </div>
    </Tile>
  );
}
