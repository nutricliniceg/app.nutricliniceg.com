import { newsletterService } from '@/lib/newsletter/newsletter.service';
import '../../../portal/portal.css';

const COPY = {
  ar: {
    doneTitle: 'تم تأكيد الاشتراك',
    doneBody: 'شكرًا — ستصلك نشرتنا.',
    badTitle: 'الرابط غير صالح أو منتهٍ',
    badBody: 'رابط التأكيد غير صالح أو مستخدم أو أقدم من 48 ساعة.',
  },
  en: {
    doneTitle: 'Subscription confirmed',
    doneBody: 'Thank you — you will receive our newsletter.',
    badTitle: 'Link invalid or expired',
    badBody: 'This confirmation link is invalid, already used, or older than 48 hours.',
  },
} as const;

export default async function NewsletterConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const ar = query.locale !== 'en';
  const t = ar ? COPY.ar : COPY.en;
  const result = await newsletterService.confirm(token);
  return (
    <div className="portal-wrap" dir={ar ? 'rtl' : 'ltr'}>
      <h1>{result.ok ? t.doneTitle : t.badTitle}</h1>
      <p>{result.ok ? t.doneBody : t.badBody}</p>
    </div>
  );
}
