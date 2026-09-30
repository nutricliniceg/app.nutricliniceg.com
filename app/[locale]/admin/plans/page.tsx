'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Plan {
  id: string;
  name_ar: string;
  name_en: string;
  price_monthly: number;
  duration_days: number;
  is_active: boolean | number;
}

export default function PlansPage() {
  const t = useTranslations('admin');
  const [rows, setRows] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name_ar: '', name_en: '', price_monthly: '', duration_days: '30' });

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const d = await readApi<{ plans: Plan[] }>(await fetch('/api/admin/plans'));
      setRows(d.plans);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(): Promise<void> {
    try {
      await readApi(await fetch('/api/admin/plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_ar: form.name_ar, name_en: form.name_en,
          price_monthly: Number(form.price_monthly), duration_days: Number(form.duration_days),
        }),
      }));
      setForm({ name_ar: '', name_en: '', price_monthly: '', duration_days: '30' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }

  async function toggle(p: Plan): Promise<void> {
    const active = !(p.is_active === true || p.is_active === 1);
    await readApi(await fetch(`/api/admin/plans/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: active }),
    }));
    await load();
  }

  return (
    <div>
      <h1>{t('plansTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <TableContainer>
        {loading ? (
          <InlineLoading description={t('loading')} />
        ) : rows.length === 0 ? (
          <p>{t('noResults')}</p>
        ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('name')}</TableHeader>
              <TableHeader>{t('priceMonthly')}</TableHeader>
              <TableHeader>{t('durationDays')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{`${p.name_ar} / ${p.name_en}`}</TableCell>
                <TableCell>{p.price_monthly}</TableCell>
                <TableCell>{p.duration_days}</TableCell>
                <TableCell>
                  <Button kind="ghost" size="sm" onClick={() => void toggle(p)}>
                    {p.is_active ? t('deactivate') : t('activate')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </TableContainer>
      <Tile>
        <h3>{t('newPlan')}</h3>
        <TextInput id="pl-ar" labelText={t('nameAr')} value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} />
        <TextInput id="pl-en" labelText={t('nameEn')} value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} />
        <TextInput id="pl-price" labelText={t('priceMonthly')} value={form.price_monthly} onChange={(e) => setForm((f) => ({ ...f, price_monthly: e.target.value }))} />
        <TextInput id="pl-days" labelText={t('durationDays')} value={form.duration_days} onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value }))} />
        <Button size="sm" onClick={() => void create()}>{t('create')}</Button>
      </Tile>
    </div>
  );
}
