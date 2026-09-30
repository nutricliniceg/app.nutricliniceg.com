'use client';

import { useEffect, useState } from 'react';
import { Content, SideNav, SideNavItems, SideNavLink, Tag } from '@carbon/react';
import { useTranslations, useLocale } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('adminNav');
  const locale = useLocale();
  const [pending, setPending] = useState(0);
  const [contacts, setContacts] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/admin/overview').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/admin/contacts').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([o, c]) => {
        if (cancelled) return;
        if (o?.success) setPending(Number(o.data?.pending_activations ?? 0));
        if (c?.success) {
          const rows = (c.data?.messages ?? []) as Array<{ status: string }>;
          setContacts(rows.filter((m) => m.status === 'new').length);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const link = (href: string, label: string, badge?: number, soon?: string) => (
    <SideNavLink key={href + label} href={soon ? '#' : `/${locale}${href}`} onClick={soon ? (e) => e.preventDefault() : undefined}>
      {label}
      {typeof badge === 'number' && badge > 0 && <Tag type="red">{badge}</Tag>}
      {soon && <Tag type="cool-gray">{soon}</Tag>}
    </SideNavLink>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <SideNav expanded aria-label="Admin navigation">
        <SideNavItems>
          {link('/admin', t('overview'))}
          {link('/admin/users', t('users'))}
          {link('/admin/activations', t('activations'), pending)}
          {link('/admin/subscriptions', t('subscriptions'))}
          {link('/admin/plans', t('plans'))}
          {link('/admin/cms', t('cms'))}
          {link('/admin/food-lists', t('foodLists'))}
          {link('/admin/blog', t('blog'))}
          {link('/admin/newsletter/subscribers', t('newsletter'))}
          {link('/admin/ai-providers', t('aiProviders'))}
          {link('/admin/cost', t('aiCost'))}
          {link('/admin/usage', t('aiUsage'))}
          {link('/admin/security', t('security'))}
          {link('/admin/audit', t('audit'))}
          {link('/admin/contacts', t('contacts'), contacts)}
          {link('/admin/payments', t('payments'))}
          {link('/admin/bulk-email', t('bulkEmail'))}
          {link('/admin/errors', t('errors'))}
          {link('/admin/settings', t('settings'))}
        </SideNavItems>
      </SideNav>
      <div style={{ flex: 1 }}>
        <Content>{children}</Content>
      </div>
    </div>
  );
}
