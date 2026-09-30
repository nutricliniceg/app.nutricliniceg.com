import { notFound } from 'next/navigation';
import { cmsRepository } from '@/lib/db/repositories/cms.repo';

// SEC-07 / CMP-01: public legal pages. Content comes from CMS (CmsContent
// slug 'privacy' / 'terms', editable in Admin → CMS); bilingual defaults
// below apply until the admin publishes CMS copy. Rendered as plain text
// (no dangerouslySetInnerHTML) so CMS text can never inject scripts.
const DEFAULTS: Record<string, { ar: { title: string; body: string }; en: { title: string; body: string } }> = {
  privacy: {
    ar: {
      title: 'سياسة الخصوصية',
      body: 'نلتزم بحماية بياناتك وفق قانون حماية البيانات الشخصية المصري رقم 151 لسنة 2020.\n\n• نجمع الحد الأدنى اللازم لتشغيل العيادة (بيانات التواصل والقياسات الصحية).\n• لا تُرسل بياناتك الصحية لأي مزوّد ذكاء اصطناعي خارجي إلا بموافقتك الصريحة.\n• عناوين IP تُخزَّن مجزّأة فقط.\n• يمكنك طلب تصدير بياناتك أو حذفها نهائيًا عبر التواصل معنا.',
    },
    en: {
      title: 'Privacy Policy',
      body: 'We protect your data under Egyptian Personal Data Protection Law 151/2020.\n\n• We collect only the minimum needed to run the clinic (contact details and health measurements).\n• Your health data is never sent to an external AI provider without your explicit consent.\n• Visitor IPs are stored hashed only.\n• You may request an export or full erasure of your data at any time.',
    },
  },
  terms: {
    ar: {
      title: 'شروط الاستخدام',
      body: 'باستخدامك NutriClinicEG فأنت توافق على ما يلي:\n\n• المنصة أداة مساعدة للطبيب ولا تغني عن الاستشارة الطبية.\n• مخرجات الذكاء الاصطناعي استرشادية ويعتمدها الطبيب قبل تطبيقها.\n• يُمنع إساءة استخدام الحسابات أو محاولة الوصول غير المصرّح به.\n• الاشتراكات والتجديد والإلغاء وفق صفحة الأسعار المعلنة.',
    },
    en: {
      title: 'Terms of Use',
      body: 'By using NutriClinicEG you agree to the following:\n\n• The platform assists the doctor and does not replace medical advice.\n• AI outputs are advisory and require doctor approval before use.\n• Account abuse or unauthorized access attempts are prohibited.\n• Subscriptions, renewals and cancellations follow the published pricing page.',
    },
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: locale === 'en' ? 'Legal' : 'قانوني' };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; slug?: string }>;
}) {
  void notFound;
  const { locale } = await params;
  void locale;
  return null;
}

export function legalContent(slug: 'privacy' | 'terms', locale: string) {
  return DEFAULTS[slug][locale === 'en' ? 'en' : 'ar'];
}

export async function legalPage(slug: 'privacy' | 'terms', locale: string) {
  const loc = locale === 'en' ? 'en' : 'ar';
  try {
    const row = await cmsRepository.getPage(slug);
    if (row) {
      const title = loc === 'en' ? row.title_en || row.title_ar : row.title_ar;
      const body = loc === 'en' ? row.content_en || row.content_ar : row.content_ar;
      if (title && body) return { title, body };
    }
  } catch {
    // CMS unavailable — fall through to defaults.
  }
  return legalContent(slug, loc);
}
