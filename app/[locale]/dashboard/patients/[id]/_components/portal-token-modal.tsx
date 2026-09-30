'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, CopyButton, InlineNotification, Modal, Select, SelectItem, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface TokenRow {
  id: string;
  permissions: { view_plans: boolean; send_weight: boolean; send_note: boolean; message: boolean };
  expires_at: string;
  revoked: boolean;
  access_count: number;
  last_accessed_at: string | null;
}

interface Created {
  token: string;
  url: string;
  expiresAt: string;
}

const PERM_KEYS = ['view_plans', 'send_weight', 'send_note', 'message'] as const;

export default function PortalTokenModal({ patientId, open, onClose }: { patientId: string; open: boolean; onClose: () => void }) {
  const t = useTranslations('portalTokens');
  const [validity, setValidity] = useState('30');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [perms, setPerms] = useState<Record<(typeof PERM_KEYS)[number], boolean>>({ view_plans: true, send_weight: true, send_note: true, message: true });
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<{ tokens: TokenRow[] }>(await fetch(`/api/patients/${patientId}/portal-tokens`));
      setRows(d.tokens);
    } catch {
      setRows([]);
    }
  }, [patientId]);

  useEffect(() => {
    if (open) {
      setCreated(null);
      setError(null);
      void load();
    }
  }, [open, load]);

  async function generate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const d = await readApi<Created>(await fetch(`/api/patients/${patientId}/portal-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validity_days: Number(validity), permissions: perms, notify_email: notifyEmail.trim() || null }),
      }));
      setCreated(d);
      setNotifyEmail('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('generateFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string): Promise<void> {
    try {
      await readApi(await fetch(`/api/patients/${patientId}/portal-tokens/${id}`, { method: 'DELETE' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('revokeFailed'));
    }
  }

  return (
    <Modal open={open} modalHeading={t('title')} passiveModal onRequestClose={onClose}>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Select id="pt-validity" labelText={t('validity')} value={validity} onChange={(e) => setValidity(e.target.value)}>
        <SelectItem value="7" text={t('days7')} />
        <SelectItem value="30" text={t('days30')} />
        <SelectItem value="60" text={t('days60')} />
        <SelectItem value="90" text={t('days90')} />
      </Select>
      <TextInput id="pt-email" labelText={t('notifyEmail')} placeholder={t('notifyEmailHint')} value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} />
      {PERM_KEYS.map((key) => (
        <Checkbox key={key} id={`pt-${key}`} labelText={t(key)} checked={perms[key]} onChange={(_, { checked }) => setPerms((p) => ({ ...p, [key]: Boolean(checked) }))} />
      ))}
      <Button size="sm" onClick={() => void generate()} disabled={busy}>{t('generate')}</Button>
      {created && (
        <div>
          <p>{`${window.location.origin}${created.url}`}</p>
          <CopyButton onClick={() => void navigator.clipboard.writeText(`${window.location.origin}${created.url}`)} />
        </div>
      )}
      {rows.map((row) => (
        <div key={row.id}>
          <span>{`${new Date(row.expires_at).toLocaleDateString()} · ${t('opens', { n: row.access_count })}${row.revoked ? ` · ${t('revoked')}` : ''}`}</span>
          {!row.revoked && (
            <Button kind="danger--ghost" size="sm" onClick={() => void revoke(row.id)}>{t('revoke')}</Button>
          )}
        </div>
      ))}
    </Modal>
  );
}
