'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Search, Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  clinic_name: string | null;
  is_active: boolean | number;
  plan_name: string | null;
  subscription_ends_at: string | null;
  created_at: string;
}

export default function AdminUsersPage() {
  const t = useTranslations('admin');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (role) q.set('role', role);
      if (status) q.set('status', status);
      const d = await readApi<{ users: UserRow[]; total: number }>(await fetch(`/api/admin/users?${q.toString()}`));
      setRows(d.users);
      setTotal(d.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [search, role, status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(u: UserRow): Promise<void> {
    const active = !(u.is_active === true || u.is_active === 1);
    await readApi(await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: active }),
    }));
    await load();
  }

  async function adjust(u: UserRow): Promise<void> {
    const add = Number(days[u.id] || 0);
    if (!add) return;
    await readApi(await fetch(`/api/admin/users/${u.id}/subscription`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add_days: add, reason: reason.trim() || t('defaultReason') }),
    }));
    await load();
  }

  return (
    <div>
      <h1>{`${t('usersTitle')} (${total})`}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Search id="u-search" labelText={t('search')} placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <Select id="u-role" labelText={t('role')} value={role} onChange={(e) => setRole(e.target.value)}>
        <SelectItem value="" text={t('all')} />
        <SelectItem value="doctor" text="doctor" />
        <SelectItem value="admin" text="admin" />
        <SelectItem value="super_admin" text="super_admin" />
      </Select>
      <Select id="u-status" labelText={t('status')} value={status} onChange={(e) => setStatus(e.target.value)}>
        <SelectItem value="" text={t('all')} />
        <SelectItem value="active" text={t('active')} />
        <SelectItem value="inactive" text={t('inactive')} />
        <SelectItem value="pending" text={t('pending')} />
      </Select>
      <TextInput id="u-reason" labelText={t('adjustReason')} value={reason} onChange={(e) => setReason(e.target.value)} />
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
              <TableHeader>{t('email')}</TableHeader>
              <TableHeader>{t('role')}</TableHeader>
              <TableHeader>{t('plan')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.role}</TableCell>
                <TableCell>{u.plan_name ?? '—'}</TableCell>
                <TableCell>
                  <Button kind="ghost" size="sm" onClick={() => void toggleActive(u)}>
                    {u.is_active ? t('deactivate') : t('activate')}
                  </Button>
                  <input aria-label={t('addDays')} placeholder={t('addDays')} value={days[u.id] ?? ''} onChange={(e) => setDays((d) => ({ ...d, [u.id]: e.target.value }))} style={{ width: 90 }} />
                  <Button kind="ghost" size="sm" onClick={() => void adjust(u)}>{t('extend')}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </TableContainer>
    </div>
  );
}
