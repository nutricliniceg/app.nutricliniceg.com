import { newsletterService } from '@/lib/newsletter/newsletter.service';
import '../../../portal/portal.css';

const COPY = {
  ar: { title: 'تم إلغاء الاشتراك', body: 'لن تصلك رسائلنا بعد الآن.' },
  en: { title: 'Unsubscribed', body: 'You will not receive our emails anymore.' },
} as const;

// One-click unsubscribe: the token alone is sufficient (no login), and the
// outcome page is identical whether or not the token existed.
export default async function NewsletterUnsubscribePage({
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
  await newsletterService.unsubscribe(token);
  return (
    <div className="portal-wrap" dir={ar ? 'rtl' : 'ltr'}>
      <h1>{t.title}</h1>
      <p>{t.body}</p>
    </div>
  );
}
