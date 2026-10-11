import { legalPage } from '@/lib/cms/legal';
import PublicShell from '../_components/public-shell';

/**
 * P32-DESIGN-2 — shared renderer for the statutory legal pages
 * (/:locale/privacy and /:locale/terms). Both resolve their copy through the
 * same `legalPage()` CMS helper, so the only difference between them is the
 * slug; the shell, typography and locale switcher are identical. Declared once
 * here so the two pages cannot drift apart.
 *
 * Copy is rendered as plain text (white-space: pre-line, no
 * dangerouslySetInnerHTML) so CMS content can never inject scripts into a public
 * page — that guarantee is preserved exactly as it was before this pass.
 *
 * Zero-DB-404 preserved: legalPage() falls back to the bilingual statutory
 * defaults when the CMS table is empty, so the page always renders 200.
 */
export default async function LegalDocument({
  slug,
  locale,
  pathname,
}: {
  slug: 'privacy' | 'terms';
  locale: string;
  pathname: string;
}) {
  const loc = locale === 'en' ? 'en' : 'ar';
  const { title, body } = await legalPage(slug, locale);

  return (
    <PublicShell locale={loc} pathname={pathname} mainClassName="nc-article">
      <h1 className="nc-articleheader">{title}</h1>
      <div className="nc-article nc-legal">
        <p style={{ whiteSpace: 'pre-line' }}>{body}</p>
      </div>
    </PublicShell>
  );
}