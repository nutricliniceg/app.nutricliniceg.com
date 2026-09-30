import './portal.css';
import { TokenEntry } from './_components/portal-forms';

// PP-10 token entry. Verification happens against the API so the page
// itself never distinguishes wrong/expired/revoked (single generic error).
export default async function PortalEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const query = await searchParams;
  const locale = query.locale === 'en' ? 'en' : 'ar';
  const copy = locale === 'en'
    ? { title: 'Patient portal', hint: 'Paste the link your doctor sent you, or enter your access code.', placeholder: 'Access code', go: 'Open my plan', invalid: 'This link is invalid or has expired' }
    : { title: 'بوابة المريض', hint: 'الصق الرابط الذي أرسله طبيبك، أو أدخل رمز الدخول.', placeholder: 'رمز الدخول', go: 'فتح خطتي', invalid: 'هذا الرابط غير صالح أو انتهت صلاحيته' };
  return (
    <div className="portal-wrap" dir={locale === 'en' ? 'ltr' : 'rtl'}>
      <h1>{copy.title}</h1>
      <p>{copy.hint}</p>
      <TokenEntry invalidLabel={copy.invalid} placeholder={copy.placeholder} goLabel={copy.go} />
    </div>
  );
}
