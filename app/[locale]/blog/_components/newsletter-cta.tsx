'use client';

import { useTranslations } from 'next-intl';
import SubscribeForm from '../../../newsletter/_components/subscribe-form';

// Newsletter block on blog surfaces (P25 placeholder, wired in P27).
export default function NewsletterCta() {
  const t = useTranslations('blog');
  return (
    <section aria-label={t('newsletterTitle')}>
      <h2>{t('newsletterTitle')}</h2>
      <SubscribeForm source="blog" />
    </section>
  );
}
