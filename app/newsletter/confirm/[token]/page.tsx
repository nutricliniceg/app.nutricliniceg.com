import { getTranslations } from 'next-intl/server';
import { newsletterService } from '@/lib/newsletter/newsletter.service';
import '../../../portal/portal.css';

// P32-DESIGN-2: the copy used to live in a hardcoded COPY constant in this file,
// which broke invariant 8 (no hardcoded user-facing strings). It now comes from
// the `newsletter` namespace in messages/{ar,en}.json.
export default async function NewsletterConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const locale = query.locale === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale, namespace: 'newsletter' });

  const result = await newsletterService.confirm(token);

  return (
    <div className="portal-wrap" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <h1>{result.ok ? t('confirmedTitle') : t('confirmFailedTitle')}</h1>
      <p>{result.ok ? t('confirmedBody') : t('confirmFailedBody')}</p>
    </div>
  );
}