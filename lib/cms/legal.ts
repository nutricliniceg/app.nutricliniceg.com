import { cmsRepository } from '@/lib/db/repositories/cms.repo';

// SEC-07 / CMP-01: public legal copy. CMS (CmsContent slug) wins when the
// admin publishes it; bilingual statutory defaults apply otherwise.
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

export async function legalPage(slug: 'privacy' | 'terms', locale: string): Promise<{ title: string; body: string }> {
  const loc = locale === 'en' ? 'en' : 'ar';
  try {
    const row = await cmsRepository.getPage(slug);
    if (row) {
      const title = loc === 'en' ? row.title_en || row.title_ar : row.title_ar;
      const body = loc === 'en' ? row.content_en || row.content_ar : row.content_ar;
      if (title && body) return { title, body };
    }
  } catch {
    // CMS unavailable — fall through to statutory defaults.
  }
  return DEFAULTS[slug][loc];
}
