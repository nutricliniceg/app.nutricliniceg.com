'use client';

import { useEffect, useState } from 'react';
import { InlineNotification, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface PlanStat {
  plan_id: string | null;
  plan_name: string;
  users: number;
  price_monthly: number;
}

export default function SubscriptionsPage() {
  const t = useTranslations('admin');
  const [plans, setPlans] = useState<PlanStat[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/overview')
      .then((r) => readApi<{ subscriptions_by_plan: PlanStat[] }>(r))
      .then((d) => setPlans(d.subscriptions_by_plan))
      .catch((e) => setError(e instanceof Error ? e.message : t('loadFailed')));
  }, [t]);

  return (
    <div>
      <h1>{t('subscriptionsTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {plans.map((p) => (
        <Tile key={p.plan_id ?? 'none'}>{`${p.plan_name}: ${p.users} × ${p.price_monthly}`}</Tile>
      ))}
      <p>{t('subscriptionsHint')}</p>
    </div>
  );
}
