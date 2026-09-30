'use client';

import { useEffect, useState } from 'react';
import { Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Overview {
  doctors_total: number;
  doctors_active: number;
  pending_activations: number;
  new_contacts: number;
  subscriptions_by_plan: Array<{ plan_id: string | null; plan_name: string; users: number; price_monthly: number }>;
  mrr_estimate: number;
  ai_cost_mtd: number;
}

export default function AdminOverviewPage() {
  const t = useTranslations('admin');
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    fetch('/api/admin/overview')
      .then((r) => readApi<Overview>(r))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return <p>{t('loading')}</p>;
  return (
    <div>
      <h1>{t('overviewTitle')}</h1>
      <Tile>{`${t('doctorsTotal')}: ${data.doctors_total}`}</Tile>
      <Tile>{`${t('doctorsActive')}: ${data.doctors_active}`}</Tile>
      <Tile>{`${t('pendingActivations')}: ${data.pending_activations}`}</Tile>
      <Tile>{`${t('newContacts')}: ${data.new_contacts}`}</Tile>
      <Tile>{`${t('mrrEstimate')}: ${data.mrr_estimate}`}</Tile>
      <Tile>{`${t('aiCostMtd')}: ${data.ai_cost_mtd}`}</Tile>
      <h2>{t('subscriptionsByPlan')}</h2>
      {data.subscriptions_by_plan.map((p) => (
        <Tile key={p.plan_id ?? 'none'}>{`${p.plan_name}: ${p.users} × ${p.price_monthly}`}</Tile>
      ))}
    </div>
  );
}
