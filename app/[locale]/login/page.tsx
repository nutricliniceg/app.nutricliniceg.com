import { getTranslations } from 'next-intl/server';
import PublicShell from '../_components/public-shell';
import LoginForm from './_components/login-form';

// Public login page (/:locale/login). Fully static: no DB reads — it renders
// 200 on an empty database because credentials are posted client-side to
// /api/auth/login. Never calls notFound().
//
// P32-DESIGN-2: wrapped in the shared shell so the header, locale switcher and
// footer match /pricing and /blog, and the heading uses the same
// `.nc-section__title` type ramp instead of an unstyled <h1>.
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const loc = locale === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale: loc, namespace: 'login' });
  const sp = (await searchParams) ?? {};
  const search = new URLSearchParams(
    Object.entries(sp).map(([k, v]) => [k, String(v)] as [string, string])
  ).toString();

  return (
    <PublicShell locale={loc} pathname={`/${loc}/login`} search={search} containerClassName="nc-auth">
      <h1 className="nc-section__title">{t('title')}</h1>
      <p className="nc-section__subtitle">{t('subtitle')}</p>
      <div className="nc-card nc-auth__card">
        <LoginForm locale={loc} />
      </div>
    </PublicShell>
  );
}