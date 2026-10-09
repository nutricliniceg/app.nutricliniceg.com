import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import SiteFooter from './_components/site-footer';

// Public landing home (/:locale). Fully static: no DB reads, never
// calls notFound() — an empty CMS/database must not 404 the homepage.
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const loc = locale === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale: loc, namespace: 'home' });
  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      <nav>
        <Link href={`/${loc}/pricing`}>{t('pricing')}</Link>
        <Link href={`/${loc}/blog`}>{t('blog')}</Link>
        <Link href={`/${loc}/privacy`}>{t('privacy')}</Link>
        <Link href={`/${loc}/terms`}>{t('terms')}</Link>
      </nav>
      <SiteFooter />
    </main>
  );
}
