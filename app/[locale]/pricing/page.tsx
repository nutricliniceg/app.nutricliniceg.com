import { getTranslations } from 'next-intl/server';
import { billingService } from '@/lib/billing/billing.service';
import CheckoutPanel from './_components/checkout-panel';
import SiteFooter from '../_components/site-footer';

// PF-01: pricing content is server-rendered (plans fetched server-side, no
// client waterfall); only the checkout interaction hydrates (CheckoutPanel).
export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  let plans: Array<{
    id: string; name_ar: string; name_en: string; description_ar: string | null;
    price_monthly: number; duration_days: number;
  }> = [];
  try {
    plans = (await billingService.publicPlans()) as typeof plans;
  } catch {
    plans = [];
  }
  return (
    <div>
      <h1>{t('pricingTitle')}</h1>
      <CheckoutPanel plans={plans} />
      <SiteFooter />
    </div>
  );
}
