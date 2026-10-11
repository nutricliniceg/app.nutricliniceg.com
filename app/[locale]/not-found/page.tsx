import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import PublicShell from '../_components/public-shell';

// Localized 404 inside the [locale] segment (P32-DESIGN-2). Previously it
// re-declared its own <html>/<body>, hardcoded `font-family: system-ui` and a
// raw `#008080`, and mounted no header or locale switcher — so hitting a bad URL
// dropped the visitor out of the design system entirely. It now renders through
// the same shell and type ramp as every other public page.
//
// All strings come from the `notFound` namespace; the brand colour comes from
// --cds-link-primary. Nothing here is hardcoded.
export default async function LocaleNotFound({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const loc = locale === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale: loc, namespace: 'notFound' });

  return (
    <PublicShell locale={loc} pathname={`/${loc}/not-found`} mainClassName="nc-article">
      <h1 className="nc-section__title">{t('title')}</h1>
      <p className="nc-section__subtitle">{t('description')}</p>
      <Link className="nc-notfound__link" href={`/${loc}`}>
        {t('backHome')}
      </Link>
    </PublicShell>
  );
}