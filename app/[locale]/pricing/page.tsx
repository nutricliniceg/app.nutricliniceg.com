import { getTranslations } from 'next-intl/server';
import { billingService } from '@/lib/billing/billing.service';
import CheckoutPanel from './_components/checkout-panel';
import SiteFooter from '../_components/site-footer';
import SiteHeader from '../_components/site-header';

interface PublicPlan {
  id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  features: unknown;
  price_monthly: number;
  duration_days: number;
}

// PF-01: pricing content is server-rendered (plans fetched server-side, no
// client waterfall); only the checkout interaction hydrates (CheckoutPanel).
//
// P32-DESIGN: the zero-DB-404 rule still holds — if the plans query fails the
// panel renders an informational notice instead of throwing, so /ar/pricing
// returns 200 on an empty database.
export default async function PricingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = (await searchParams) ?? {};
  const search = new URLSearchParams(
    Object.entries(sp).map(([k, v]) => [k, String(v)] as [string, string])
  ).toString();
  const t = await getTranslations({ locale, namespace: 'billing' });
  let plans: PublicPlan[] = [];
  try {
    plans = (await billingService.publicPlans()) as unknown as PublicPlan[];
  } catch {
    plans = [];
  }
  return (
    <div>
      <SiteHeader locale={locale === 'en' ? 'en' : 'ar'} pathname={`/${locale === 'en' ? 'en' : 'ar'}/pricing`} search={search} />
      <main className="nc-container">
        <h1 className="nc-section__title">{t('pricingTitle')}</h1>
        <CheckoutPanel plans={plans} locale={locale} />
      </main>
      <SiteFooter />
    </div>
  );
}