import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export default async function LocaleNotFound({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('notFound');

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body style={{ fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ color: '#008080' }}>{t('title')}</h1>
        <p>{t('description')}</p>
        <Link href={`/${locale}`} style={{ color: '#008080', textDecoration: 'underline' }}>
          {t('backHome')}
        </Link>
      </body>
    </html>
  );
}