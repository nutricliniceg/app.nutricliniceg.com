'use client';

import { useCallback, useEffect, useState } from 'react';
import { InlineNotification, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Row {
  id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
}

export default function AuditPage() {
  const t = useTranslations('adminAi');
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const q = new URLSearchParams();
      if (action.trim()) q.set('action', action.trim());
      if (entity.trim()) q.set('entity', entity.trim());
      const d = await readApi<{ rows: Row[]; total: number }>(await fetch(`/api/admin/audit?${q.toString()}`));
      setRows(d.rows);
      setTotal(d.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [action, entity, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>{`${t('auditTitle')} (${total})`}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <TextInput id="au-action" labelText={t('action')} value={action} onChange={(e) => setAction(e.target.value)} />
      <TextInput id="au-entity" labelText={t('entity')} value={entity} onChange={(e) => setEntity(e.target.value)} />
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('actor')}</TableHeader>
              <TableHeader>{t('action')}</TableHeader>
              <TableHeader>{t('entity')}</TableHeader>
              <TableHeader>{t('date')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{`${r.actor_id} (${r.actor_role})`}</TableCell>
                <TableCell>{r.action}</TableCell>
                <TableCell>{`${r.entity_type}${r.entity_id ? `/${r.entity_id}` : ''}`}</TableCell>
                <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
