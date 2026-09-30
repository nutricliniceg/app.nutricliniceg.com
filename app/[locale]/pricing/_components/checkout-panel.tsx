'use client';

import { useState } from 'react';
import { Button, InlineNotification, Select, SelectItem, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

export interface PricingPlan {
  id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  price_monthly: number;
  duration_days: number;
}

// Client island: checkout interaction only. Plan content is server-rendered
// by the pricing page (PF-01 above-the-fold SSR).
export default function CheckoutPanel({ plans }: { plans: PricingPlan[] }) {
  const t = useTranslations('billing');
  const [method, setMethod] = useState<'paymob' | 'manual'>('paymob');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function checkout(planId: string): Promise<void> {
    setError(null);
    try {
      if (method === 'manual') {
        if (!reference.trim()) {
          setError(t('referenceRequired'));
          return;
        }
        await readApi(await fetch('/api/billing/manual', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_id: planId, method: 'manual', reference: reference.trim() }),
        }));
        setNotice(t('manualReceived'));
        return;
      }
      const d = await readApi<{ payment_url: string }>(await fetch('/api/billing/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, method: 'paymob' }),
      }));
      window.location.href = d.payment_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('checkoutFailed'));
    }
  }

  return (
    <div>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {notice && <InlineNotification kind="success" title={notice} lowContrast />}
      <Select id="pay-method" labelText={t('payMethod')} value={method} onChange={(e) => setMethod(e.target.value as 'paymob' | 'manual')}>
        <SelectItem value="paymob" text={t('paymob')} />
        <SelectItem value="manual" text={t('manual')} />
      </Select>
      {method === 'manual' && (
        <>
          <p>{t('manualInstructions')}</p>
          <TextInput id="pay-ref" labelText={t('reference')} value={reference} onChange={(e) => setReference(e.target.value)} />
        </>
      )}
      {plans.map((p) => (
        <Tile key={p.id}>
          <h3>{`${p.name_ar} / ${p.name_en}`}</h3>
          <p>{p.description_ar ?? ''}</p>
          <p>{`${p.price_monthly} EGP / ${p.duration_days}d`}</p>
          <Button size="sm" onClick={() => void checkout(p.id)}>{t('subscribe')}</Button>
        </Tile>
      ))}
    </div>
  );
}
