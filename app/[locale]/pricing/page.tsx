import { getTranslations } from 'next-intl/server';
import { billingService } from '@/lib/billing/billing.service';
import CheckoutPanel from './_components/checkout-panel';
import SiteFooter from '../_components/site-footer';

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
export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  let plans: PublicPlan[] = [];
  try {
    plans = (await billingService.publicPlans()) as unknown as PublicPlan[];
  } catch {
    plans = [];
  }
  return (
    <div>
      <main className="nc-container">
        <h1 className="nc-section__title">{t('pricingTitle')}</h1>
        <CheckoutPanel plans={plans} locale={locale} />
      </main>
      <SiteFooter />
    </div>
  );
}