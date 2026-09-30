'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Search,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Modal,
  TextInput,
  InlineNotification,
} from '@carbon/react';
import { Add, Edit, TrashCan, Download, Upload } from '@carbon/icons-react';
import { useTranslations } from 'next-intl';

interface GlobalItem {
  id: string;
  name_ar: string;
  name_en: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  category: string | null;
}

import { readApi } from '@/lib/api/fetch-json';

// P11 admin section (interim — full admin shell arrives in P22).
// Manages the PUBLIC list: global items + global Excel import.
export default function AdminFoodListsClient() {
  const t = useTranslations('foodLists');
  const [items, setItems] = useState<GlobalItem[]>([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GlobalItem | null>(null);
  const [nameAr, setNameAr] = useState('');
  const [macros, setMacros] = useState({ kcal: '', protein: '', carbs: '', fats: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const params = new URLSearchParams({ scope: 'global' });
      if (search.trim()) params.set('search', search.trim());
      const data = await readApi<{ items: GlobalItem[] }>(await fetch(`/api/foods?${params.toString()}`));
      setItems(data.items);
      setError(null);
    } catch {
      setError(t('loadFailed'));
    }
  }, [search, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  function openAdd(): void {
    setEditing(null);
    setNameAr('');
    setMacros({ kcal: '', protein: '', carbs: '', fats: '' });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: GlobalItem): void {
    setEditing(item);
    setNameAr(item.name_ar);
    setMacros({
      kcal: String(item.calories_per_100g),
      protein: String(item.protein_per_100g),
      carbs: String(item.carbs_per_100g),
      fats: String(item.fats_per_100g),
    });
    setError(null);
    setModalOpen(true);
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    const payload = {
      name_ar: nameAr,
      calories_per_100g: Number(macros.kcal),
      protein_per_100g: Number(macros.protein),
      carbs_per_100g: Number(macros.carbs),
      fats_per_100g: Number(macros.fats),
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
      setError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate(): Promise<void> {
    const res = await fetch('/api/foods/template');
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'food-import-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await readApi(await fetch('/api/foods/import?scope=global', { method: 'POST', body: form }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function removeItem(id: string): Promise<void> {
    if (!window.confirm(t('deleteConfirm'))) return;
    try {
      await readApi(await fetch(`/api/foods/${id}`, { method: 'DELETE' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>{t('title')} — {t('globalScope')}</h1>
      {error && <InlineNotification kind="error" title={error} hideCloseButton lowContrast />}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Search id="admin-food-search" labelText={t('searchPlaceholder')} placeholder={t('searchPlaceholder')} value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} />
        <Button kind="primary" size="md" renderIcon={Add} onClick={openAdd}>
          {t('addItem')}
        </Button>
        <Button kind="tertiary" size="md" renderIcon={Download} onClick={downloadTemplate}>
          {t('downloadTemplate')}
        </Button>
        <Button kind="secondary" size="md" renderIcon={Upload} disabled={busy} onClick={() => document.getElementById('admin-import-file')?.click()}>
          {t('import')}
        </Button>
        <input id="admin-import-file" type="file" accept=".xlsx" aria-label={t('import')} style={{ display: 'none' }} onChange={runImport} />
      </div>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('nameAr')}</TableHeader>
              <TableHeader>{t('calories')}</TableHeader>
              <TableHeader>{t('category')}</TableHeader>
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
                  <Button kind="ghost" size="sm" renderIcon={Edit} onClick={() => openEdit(item)} aria-label={t('editItem')} />
                  <Button kind="ghost" size="sm" renderIcon={TrashCan} onClick={() => removeItem(item.id)} aria-label={t('deleteConfirm')} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {items.length === 0 && <p style={{ opacity: 0.7 }}>{t('noItems')}</p>}
      <Modal
        open={modalOpen}
        modalHeading={editing ? t('editItem') : t('addItem')}
        primaryButtonText={t('save')}
        secondaryButtonText={t('cancel')}
        onRequestClose={() => setModalOpen(false)}
        onRequestSubmit={submit}
        primaryButtonDisabled={busy}
      >
        <TextInput id="adm-name-ar" labelText={t('nameAr')} value={nameAr} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameAr(e.target.value)} />
        <TextInput id="adm-kcal" labelText={t('calories')} value={macros.kcal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMacros((m) => ({ ...m, kcal: e.target.value }))} inputMode="decimal" />
        <TextInput id="adm-protein" labelText={t('protein')} value={macros.protein} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMacros((m) => ({ ...m, protein: e.target.value }))} inputMode="decimal" />
        <TextInput id="adm-carbs" labelText={t('carbs')} value={macros.carbs} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMacros((m) => ({ ...m, carbs: e.target.value }))} inputMode="decimal" />
        <TextInput id="adm-fats" labelText={t('fats')} value={macros.fats} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMacros((m) => ({ ...m, fats: e.target.value }))} inputMode="decimal" />
      </Modal>
    </div>
  );
}
