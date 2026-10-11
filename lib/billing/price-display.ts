// P32-DESIGN §2 — dir-agnostic display formatting for the public pricing page.
//
// WHY THIS EXISTS
// ---------------
// The pricing page previously rendered the raw row values:
//
//     1599.00 EGP / 180d
//
// Inside an RTL paragraph that string is reordered by the bidi algorithm and
// reads as broken ("180d / 1599.00 EGP" with the digits split). This module
// produces a human period label and a grouped number, and the markup isolates
// the numeric run with the `.nc-num` class (direction:ltr; unicode-bidi:isolate)
// so it can never reflow.
//
// NOTE ON BILLING SEMANTICS (do not "fix" the numbers here):
// `SubscriptionPlan.price_monthly` is the TOTAL charged for the period —
// billing.service.ts bills `price_monthly * 100` cents regardless of
// `duration_days`. So the display shows the total for the whole period.
// Renaming the column is tracked as P33 debt; this module only formats.

export type PublicLocale = 'ar' | 'en';

/** Group the amount with thousands separators, keeping Latin digits. */
export function formatAmount(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe);
}

/**
 * Maps a plan's duration in days onto a stable i18n key so the label lives in
 * messages/*.json (no hardcoded user-facing strings).
 *   30  -> month        180 -> sixMonths      365 -> year
 * Anything else falls back to `days` and is interpolated by the caller.
 */
export function periodKey(durationDays: number): 'month' | 'sixMonths' | 'year' | 'days' {
  if (durationDays <= 31) return 'month';
  if (durationDays <= 200) return 'sixMonths';
  if (durationDays <= 400) return 'year';
  return 'days';
}

export interface FormattedPrice {
  /** Grouped amount only, e.g. "1,599". */
  amount: string;
  /** i18n key for the period label. */
  periodKey: 'month' | 'sixMonths' | 'year' | 'days';
  /** Raw day count, needed only by the `days` fallback label. */
  durationDays: number;
  /** True when the plan should be visually elevated on the pricing grid. */
  featured: boolean;
}

/**
 * The featured (elevated) plan is the mid-tier one on a 3-plan grid. Chosen by
 * rank rather than hardcoded id so reordering SubscriptionPlan.sort_order or
 * editing prices cannot strand the highlight on the cheapest plan.
 */
export function pickFeaturedIndex(plans: ReadonlyArray<{ duration_days: number }>): number {
  if (plans.length < 3) return -1;
  return 1;
}

export function formatPlanPrice(
  plan: { price_monthly: number | string; duration_days: number },
  index: number,
): FormattedPrice {
  const amount = Number(plan.price_monthly);
  return {
    amount: formatAmount(amount),
    periodKey: periodKey(Number(plan.duration_days)),
    durationDays: Number(plan.duration_days),
    featured: index === 1,
  };
}