'use client';

import { useState } from 'react';
import {
  Button,
  InlineNotification,
  RadioButton,
  RadioButtonGroup,
  TextInput,
} from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';
import { formatPlanPrice } from '@/lib/billing/price-display';

export interface PricingPlan {
  id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  features: unknown;
  price_monthly: number;
  duration_days: number;
}

/**
 * P32-DESIGN §2 — pricing rendered as a Carbon card grid.
 *
 * Previously each plan was a bare <Tile> printing `name_ar / name_en` and the
 * raw `1599.00 EGP / 180d`. Inside RTL that string is bidi-reordered, and the
 * duplicated slash-joined name looked broken. Now: one name per locale, a
 * grouped amount inside `.nc-plan__amount` (tabular, isolated), a human period
 * label from i18n, and a feature list when the plan carries one.
 *
 * `price_monthly` is the TOTAL charged for the period (billing.service.ts bills
 * it as a whole) — displayed as such, not divided per month.
 */
export default function CheckoutPanel({ plans, locale }: { plans: PricingPlan[]; locale: string }) {
  const t = useTranslations('billing');
  const isAr = locale === 'ar';
  const [method, setMethod] = useState<'paymob' | 'manual'>('paymob');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function checkout(planId: string) {
    setError(null);
    if (method === 'manual') {
      if (!reference.trim()) {
        setError(t('referenceRequired'));
        return;
      }
      try {
        await readApi(
          await fetch('/api/billing/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId, method: 'manual', reference: reference.trim() }),
          })
        );
        setNotice(t('manualReceived'));
      } catch (e) {
        setError(e instanceof Error ? e.message : t('checkoutFailed'));
      }
      return;
    }
    try {
      const d = await readApi<{ payment_url: string }>(
        await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_id: planId, method: 'paymob' }),
        })
      );
      window.location.href = d.payment_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('checkoutFailed'));
    }
  }

  if (plans.length === 0) {
    return <InlineNotification kind="info" title={t('plansUnavailable')} lowContrast />;
  }

  return (
    <div>
      <div style={{ marginBlockEnd: '1.5rem' }}>
        <RadioButtonGroup
          legendText={t('payMethod')}
          name="pay-method"
          valueSelected={method}
          onChange={(v) => setMethod(v as 'paymob' | 'manual')}
          orientation="horizontal"
        >
          <RadioButton id="pay-paymob" value="paymob" labelText={t('paymob')} />
          <RadioButton id="pay-manual" value="manual" labelText={t('manual')} />
        </RadioButtonGroup>
        <p style={{ marginBlockStart: '0.75rem' }}>{t('payNote')}</p>
        {method === 'manual' && (
          <>
            <p>{t('manualInstructions')}</p>
            <TextInput
              id="pay-ref"
              labelText={t('reference')}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </>
        )}
      </div>

      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {notice && <InlineNotification kind="success" title={notice} lowContrast />}

      <div className="nc-pricing">
        {plans.map((plan, index) => {
          const price = formatPlanPrice(plan, index);
          const name = isAr ? plan.name_ar : plan.name_en || plan.name_ar;
          const description = isAr ? plan.description_ar : plan.description_en || plan.description_ar;
          const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
          const period =
            price.periodKey === 'days'
              ? t('period_days', { days: price.durationDays })
              : t(`period_${price.periodKey}`);

          return (
            <article
              key={plan.id}
              className={`nc-plan${price.featured ? ' nc-plan--featured' : ''}`}
              aria-label={name}
            >
              {price.featured && (
                <div className="nc-plan__badge">
                  <span className="cds--tag cds--tag--teal" style={{ fontWeight: 600 }}>
                    {t('featuredBadge')}
                  </span>
                </div>
              )}
              <h3 className="nc-plan__name">{name}</h3>
              {description && <p className="nc-plan__desc">{description}</p>}

              <div className="nc-plan__price">
                <span className="nc-plan__amount">{price.amount}</span>
                <span className="nc-plan__currency">{t('currency')}</span>
                <span className="nc-plan__period">/ {t('perPeriod', { period: period })}</span>
              </div>
              <p className="nc-plan__tagline">{t('planTagline')}</p>

              {features.length > 0 && (
                <>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBlockEnd: '0.5rem' }}>
                    {t('planIncludes')}
                  </h4>
                  <ul className="nc-plan__features">
                    {features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </>
              )}

              <Button
                className="nc-plan__cta"
                kind={price.featured ? 'primary' : 'tertiary'}
                size="lg"
                onClick={() => void checkout(plan.id)}
              >
                {t('planCta', { plan: name })}
              </Button>
            </article>
          );
        })}
      </div>
    </div>
  );
}