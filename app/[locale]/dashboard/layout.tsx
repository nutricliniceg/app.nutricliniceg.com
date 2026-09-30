'use client';

import {
  Content,
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
} from '@carbon/react';
import {
  Home,
  UserSettings,
  Settings as SettingsIcon,
  Template,
  Restaurant,
  Chat,
  Email,
  Notification,
  Search as SearchIcon,
  UserAvatar,
} from '@carbon/icons-react';
import { useTranslations, useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import SubscriptionBanner from './_components/subscription-banner';

const NAV_ITEMS = [
  { key: 'dashboard', href: '/dashboard', labelKey: 'dashboard', icon: Home },
  { key: 'patients', href: '/dashboard/patients', labelKey: 'patients', icon: UserSettings },
  { key: 'food-lists', href: '/dashboard/food-lists', labelKey: 'foodLists', icon: SettingsIcon },
  { key: 'plans', href: '/dashboard/plans/new', labelKey: 'plans', icon: Restaurant },
  { key: 'exercises', href: '/dashboard/exercises/new', labelKey: 'exercises', icon: Restaurant },
  { key: 'templates', href: '/dashboard/templates', labelKey: 'templates', icon: Template },
  { key: 'ai-assistant', href: '/dashboard/ai-assistant', labelKey: 'aiAssistant', icon: Chat },
  { key: 'inbox', href: '/dashboard/inbox', labelKey: 'inbox', icon: Email },
  { key: 'settings', href: '/dashboard/settings', labelKey: 'settings', icon: SettingsIcon },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const titleT = useTranslations('dashboard');
  const commonT = useTranslations('common');
  const locale = useLocale();
  const [unread, setUnread] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/notifications?unread=true')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.success) setUnread(Number(d.data?.unread ?? 0));
      })
      .catch(() => {});
    const loadMessages = () => {
      fetch('/api/messages/unread-summary')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d?.success) setUnreadMessages(Number(d.data?.total_unread ?? 0));
        })
        .catch(() => {});
    };
    loadMessages();
    const timer = setInterval(loadMessages, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <SideNav expanded aria-label="Main navigation">
        <SideNavItems>
          {NAV_ITEMS.map((item) => (
            <SideNavLink key={item.key} href={`/${locale}${item.href}`} renderIcon={item.icon}>
              {item.key === 'inbox' && unreadMessages > 0 ? `${t(item.labelKey)} (${unreadMessages})` : t(item.labelKey)}
            </SideNavLink>
          ))}
        </SideNavItems>
      </SideNav>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header aria-label="NutriClinicEG">
          <HeaderName href={`/${locale}/dashboard`} prefix="">
            NutriClinicEG
          </HeaderName>
          <HeaderGlobalBar>
            <HeaderGlobalAction aria-label={commonT('search')} onClick={() => {}}>
              <SearchIcon size={20} />
            </HeaderGlobalAction>
            <HeaderGlobalAction aria-label={titleT('notifications')} onClick={() => {}}>
              <span style={{ position: 'relative' }}>
                <Notification size={20} />
                {unread > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -6,
                      insetInlineEnd: -6,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      background: '#da1e28',
                      color: '#fff',
                      fontSize: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                    }}
                  >
                    {unread}
                  </span>
                )}
              </span>
            </HeaderGlobalAction>
            <HeaderGlobalAction aria-label={commonT('profile')} onClick={() => {}}>
              <UserAvatar size={20} />
            </HeaderGlobalAction>
          </HeaderGlobalBar>
        </Header>
        <Content>
          <SubscriptionBanner />
          {children}
        </Content>
      </div>
    </div>
  );
}
