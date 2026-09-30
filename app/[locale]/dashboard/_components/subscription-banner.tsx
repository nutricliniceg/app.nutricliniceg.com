'use client';

import { useEffect, useState } from 'react';
import { InlineNotification } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Status {
  state: string;
  banner: 'none' | 'grace' | 'expired';
  ends_at: string | null;
}

// R16 doctor-visible banner: action required during grace, locked after.
export default function SubscriptionBanner() {
  const t = useTranslations('billing');
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch('/api/billing/status')
      .then((r) => (r.ok ? readApi<Status>(r) : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status || status.banner === 'none') return null;
  return (
    <InlineNotification
      kind={status.banner === 'grace' ? 'warning' : 'error'}
      title={status.banner === 'grace' ? t('graceBanner') : t('expiredBanner')}
      lowContrast
    />
  );
}
