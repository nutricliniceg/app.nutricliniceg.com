import { getTranslations } from 'next-intl/server';
import SiteFooter from '../_components/site-footer';
import LoginForm from './_components/login-form';

// Public login page (/:locale/login). Fully static: no DB reads — it renders
// 200 on an empty database because credentials are posted client-side to
// /api/auth/login. Never calls notFound().
export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const loc = locale === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale: loc, namespace: 'login' });
  return (
    <main>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      <LoginForm locale={loc} />
      <SiteFooter />
    </main>
  );
}