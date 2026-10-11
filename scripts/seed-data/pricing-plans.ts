// P32-SEED — 3 public pricing plans.
//
// IMPORTANT (read before changing the numbers): `SubscriptionPlan.price_monthly`
// is NOT a per-month rate. billing.service.ts:47 charges
// `Math.round(Number(plan.price_monthly) * 100)` cents for the plan regardless
// of `duration_days`, and the pricing UI renders `{price_monthly} EGP /
// {duration_days}d` (app/[locale]/pricing/_components/checkout-panel.tsx:69).
// So the column is effectively the TOTAL amount charged for that billing
// period. A semi-annual plan at 1599 EGP therefore stores 1599 with
// duration_days = 180 — storing 266.50 would charge 266 EGP for six months.
//
// `features` is a JSON column holding a flat array of strings. The public
// pricing page does not render it yet (P33 ledger: surface it), but the admin
// plans screen and the checkout summary do.

export interface SeedPlan {
  /** Idempotency key. SubscriptionPlan has no slug column, so the stable
   *  English name is the natural key (the seed upserts on it). */
  key: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  /** Total EGP charged for the whole period (see note above). */
  price: number;
  duration_days: number;
  max_patients: number | null;
  max_ai_calls_monthly: number | null;
  features: string[];
  sort_order: number;
}

export const SEED_PLANS: SeedPlan[] = [
  {
    key: 'Monthly',
    name_ar: 'اشتراك شهري',
    name_en: 'Monthly',
    description_ar:
      'مناسب للطبيب الذي يبدأ استخدام المنصة ويجربها على عدد محدود من المرضى. كل المميزات الأساسية متاحة طوال فترة الاشتراك.',
    description_en:
      'For doctors starting out with a limited patient load. Every core feature is available for the whole subscription period.',
    price: 399,
    duration_days: 30,
    max_patients: 25,
    max_ai_calls_monthly: 150,
    features: [
      'حتى 25 مريض',
      '150 استدعاء ذكاء اصطناعي شهريًا',
      'توليد خطط التغذية والتمارين',
      'بوابة المريض عبر الرابط',
      'دعم عبر البريد الإلكتروني',
    ],
    sort_order: 1,
  },
  {
    key: 'Semi-annual',
    name_ar: 'اشتراك نصف سنوي',
    name_en: 'Semi-annual',
    description_ar:
      'خيار متوازن للعيادة المستقرة: سعر أقل شهريًا مقابل الالتزام لمدة ستة أشهر، مع مساحة أكبر للمرضى واستدعاءات الذكاء الاصطناعي.',
    description_en:
      'The balanced option for an established clinic: a lower effective monthly rate in exchange for a six-month commitment, with more room for patients and AI calls.',
    price: 1599,
    duration_days: 180,
    max_patients: 80,
    max_ai_calls_monthly: 500,
    features: [
      'حتى 80 مريض',
      '500 استدعاء ذكاء اصطناعي شهريًا',
      'جميع مزايا الاشتراك الشهري',
      'مكتبة قوالب خطط جاهزة',
      'تقارير متقدمة للعيادة',
    ],
    sort_order: 2,
  },
  {
    key: 'Annual',
    name_ar: 'اشتراك سنوي',
    name_en: 'Annual',
    description_ar:
      'أفضل قيمة للعيادات ذات الحجم الكبير. يشمل أعلى عدد من المرضى والاستدعاءات، مع تصدير بيانات العيادة والتقارير السنوية.',
    description_en:
      'The best value for high-volume clinics. Includes the highest patient and AI-call allowances, plus data export and annual reporting.',
    price: 2799,
    duration_days: 365,
    max_patients: 250,
    max_ai_calls_monthly: 1500,
    features: [
      'حتى 250 مريض',
      '1500 استدعاء ذكاء اصطناعي شهريًا',
      'جميع مزايا الاشتراك نصف السنوي',
      'تصدير بيانات العيادة (CMP-04)',
      'تقارير سنوية متقدمة',
    ],
    sort_order: 3,
  },
];