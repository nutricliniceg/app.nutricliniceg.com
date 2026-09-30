'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Search,
  Select,
  SelectItem,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Tag,
  InlineNotification,
} from '@carbon/react';
import { Add, Edit, TrashCan } from '@carbon/icons-react';
import { useTranslations } from 'next-intl';
import FoodFormModal from './_components/food-form-modal';
import ImportPanel from './_components/import-panel';
import RequestPanel from './_components/request-panel';
import ListsPanel from './_components/lists-panel';
import { CATEGORY_OPTIONS, readApi, type FoodItemDto } from './_components/types';

interface ListData {
  items: FoodItemDto[];
  total: number;
}

function splitList(raw: string): string[] | null {
  const parts = raw.split(',').map((s) => s.trim()).filter((s) => s !== '');
  return parts.length > 0 ? parts : null;
}

export default function FoodListsPage() {
  const t = useTranslations('foodLists');
  const [items, setItems] = useState<FoodItemDto[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [scope, setScope] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FoodItemDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (category) params.set('category', category);
      if (scope !== 'all') params.set('scope', scope);
      const data = await readApi<ListData>(await fetch(`/api/foods?${params.toString()}`));
      setItems(data.items);
      setError(null);
    } catch {
      setError(t('loadFailed'));
    }
  }, [search, category, scope, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  function openAdd(): void {
    setEditing(null);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(item: FoodItemDto): void {
    setEditing(item);
    setFormError(null);
    setModalOpen(true);
  }

  async function submitForm(values: Record<string, string>): Promise<void> {
    setSaving(true);
    setFormError(null);
    const payload = {
      name_ar: values.name_ar,
      name_en: values.name_en || null,
      calories_per_100g: Number(values.calories_per_100g),
      protein_per_100g: Number(values.protein_per_100g),
      carbs_per_100g: Number(values.carbs_per_100g),
      fats_per_100g: Number(values.fats_per_100g),
      category: values.category || null,
      tags: splitList(values.tags),
      pairing_tags: splitList(values.pairing_tags),
    };
    try {
      if (editing) {
        await readApi(await fetch(`/api/foods/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }));
      } else {
        await readApi(await fetch('/api/foods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }));
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(item: FoodItemDto): Promise<void> {
    if (!window.confirm(t('deleteConfirm'))) return;
    try {
      const res = await fetch(`/api/foods/${item.id}`, { method: 'DELETE' });
      const data = await readApi<{ archived: boolean }>(res);
      if (data.archived) setNotice(t('archivedNotice'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1>{t('title')}</h1>
        <p style={{ opacity: 0.75 }}>{t('subtitle')}</p>
      </div>
      {error && <InlineNotification kind="error" title={error} hideCloseButton lowContrast />}
      {notice && <InlineNotification kind="info" title={notice} hideCloseButton lowContrast onCloseButtonClick={() => setNotice(null)} />}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Search id="food-search" labelText={t('searchPlaceholder')} placeholder={t('searchPlaceholder')} value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} />
        <Select id="food-cat" labelText={t('category')} value={category} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)}>
          <SelectItem value="" text={t('allCategories')} />
          {CATEGORY_OPTIONS.map((c) => (
            <SelectItem key={c} value={c} text={c} />
          ))}
        </Select>
        <Select id="food-scope" labelText={t('allScopes')} value={scope} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setScope(e.target.value)}>
          <SelectItem value="all" text={t('allScopes')} />
          <SelectItem value="global" text={t('globalScope')} />
          <SelectItem value="mine" text={t('mineScope')} />
        </Select>
        <Button kind="primary" size="md" renderIcon={Add} onClick={openAdd}>
          {t('addItem')}
        </Button>
      </div>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('nameAr')}</TableHeader>
              <TableHeader>{t('calories')}</TableHeader>
              <TableHeader>{t('category')}</TableHeader>
              <TableHeader>{t('globalBadge')}</TableHeader>
              <TableHeader>{t('save')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  {item.name_ar}
                  {item.name_en ? ` — ${item.name_en}` : ''}
                </TableCell>
                <TableCell>
                  {item.calories_per_100g} {t('kcal')}
                </TableCell>
                <TableCell>{item.category ?? '—'}</TableCell>
                <TableCell>
                  <Tag type={item.owner_id === null ? 'green' : 'cool-gray'}>
                    {item.owner_id === null ? t('globalBadge') : t('mineBadge')}
                  </Tag>
                </TableCell>
                <TableCell>
                  {item.owner_id !== null && (
                    <>
                      <Button kind="ghost" size="sm" renderIcon={Edit} onClick={() => openEdit(item)} aria-label={t('editItem')} />
                      <Button kind="ghost" size="sm" renderIcon={TrashCan} onClick={() => removeItem(item)} aria-label={t('deleteConfirm')} />
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {items.length === 0 && <p style={{ opacity: 0.7 }}>{t('noItems')}</p>}
      <ListsPanel />
      <ImportPanel onImported={load} />
      <RequestPanel />
      <FoodFormModal
        key={editing ? editing.id : 'new'}
        open={modalOpen}
        initial={editing}
        saving={saving}
        error={formError}
        onClose={() => setModalOpen(false)}
        onSubmit={submitForm}
      />
    </div>
  );
}
