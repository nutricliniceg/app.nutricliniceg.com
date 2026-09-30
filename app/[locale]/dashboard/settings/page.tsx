'use client';

import { useTranslations } from 'next-intl';
import BrandingForm from './_components/branding-form';

export default function SettingsPage() {
  const t = useTranslations('settings');
  return (
    <div>
      <h1>{t('title')}</h1>
      <BrandingForm />
    </div>
  );
}
