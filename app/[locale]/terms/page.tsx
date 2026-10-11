import LegalDocument from '../_components/legal-document';

// Rendered through the shared legal document shell (P32-DESIGN-2): same header,
// locale switcher, footer and `.nc-article` typography as the blog articles.
export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const loc = locale === 'en' ? 'en' : 'ar';
  return <LegalDocument slug="terms" locale={locale} pathname={`/${loc}/terms`} />;
}