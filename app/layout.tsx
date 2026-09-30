import { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import SentryInit from './sentry-init';
import './globals.scss';

export const metadata: Metadata = {
  title: 'NutriClinicEG',
  description: 'B2B SaaS for nutrition clinics',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // UI-07: root layout params do NOT carry the [locale] segment — resolve
  // the locale via next-intl so <html lang dir> is always correct (RTL).
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <body>
        <SentryInit />
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
