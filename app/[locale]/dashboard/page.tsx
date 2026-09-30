'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Button, Tag, InlineLoading } from '@carbon/react';
import { Add } from '@carbon/icons-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// UI-13: recharts (~100kB) loads only when the chart scrolls into use, not
// with the dashboard first-load bundle.
const WeeklyChart = dynamic(() => import('./_components/weekly-chart'), {
  loading: () => <InlineLoading description="" />,
});

interface Stats {
  total: number;
  visitsThisWeek: number;
  activePlans: number;
  weekly: Array<{ day: string; visits: number; plans: number }>;
}

export default function DashboardHome() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.success) setStats(d.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    { label: t('totalPatients'), value: stats?.total ?? 0 },
    { label: t('visitsThisWeek'), value: stats?.visitsThisWeek ?? 0 },
    { label: t('activePlans'), value: stats?.activePlans ?? 0 },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0 }}>{t('dashboard')}</h1>
        <Link href={`/${locale}/dashboard/patients/new`}>
          <Button kind="primary" renderIcon={Add}>
            {t('newPatient')}
          </Button>
        </Link>
      </div>
      {loading ? (
        <InlineLoading description={t('loading')} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {cards.map((c) => (
            <div key={c.label} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 }}>
              <p style={{ margin: '0 0 4px', fontSize: 14 }}>{c.label}</p>
              <p style={{ margin: 0, fontSize: 32, fontWeight: 600 }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{t('weeklyActivity')}</h2>
          <WeeklyChart data={stats?.weekly ?? []} visitsLabel={t('visits')} plansLabel={t('plans')} />
        </div>
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{t('quickActions')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link href={`/${locale}/dashboard/patients/new`}>
              <Button kind="primary" renderIcon={Add}>
                {t('newPatient')}
              </Button>
            </Link>
            <Link href={`/${locale}/dashboard/patients`}>
              <Button kind="secondary">{t('viewAllPatients')}</Button>
            </Link>
            <Tag type="outline">{t('aiSummaryComingSoon')}</Tag>
          </div>
        </div>
      </div>
    </div>
  );
}
