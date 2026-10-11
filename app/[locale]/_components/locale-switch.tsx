import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/**
 * P32-DESIGN Defect 4 — restores the public locale switcher that the visual
 * pass dropped when it replaced the stopgap landing.
 *
 * Placement-only restore: it renders the two keys that already existed in
 * messages/*.json (`common.switch_to_english` / `common.switch_to_arabic`).
 * Those keys are intentionally asymmetric — each locale labels the switch with
 * the OTHER language's own name — so no new translated copy is required and
 * `check-messages` allowlists the asymmetry.
 *
 * The href swaps only the locale segment and preserves the remaining path, so
 * switching language keeps the visitor on the same page. Server component: adds
 * no client JS to the public bundle.
 *
 * `search` is passed in from the page (which already awaits searchParams); it is
 * kept so a query string such as the blog `?page=2` survives the switch.
 */
export default async function LocaleSwitch({
  pathname,
  search = '',
}: {
  pathname: string;
  search?: string;
}) {
  const isAr = pathname === '/ar' || pathname.startsWith('/ar/');
  const target = isAr ? 'en' : 'ar';

  // '/ar/blog/x?page=2' -> '/en/blog/x?page=2'
  const [rawPath, rawQuery = ''] = pathname.split('?');
  const segs = rawPath.split('/').filter(Boolean); // ['ar','blog','x']
  const rest = segs.slice(1).map(encodeURIComponent);
  const query = rawQuery || search.replace(/^\?/, '');
  const href = `/${target}${rest.length ? '/' + rest.join('/') : ''}${query ? '?' + query : ''}`;

  const t = await getTranslations({ locale: isAr ? 'ar' : 'en', namespace: 'common' });
  const label = isAr ? t('switch_to_english') : t('switch_to_arabic');

  return (
    <nav aria-label={label} style={{ display: 'inline-block' }}>
      <Link
        href={href}
        hrefLang={target}
        lang={target}
        style={{ textDecoration: 'none', color: 'var(--cds-link-primary)', fontWeight: 600 }}
      >
        {label}
      </Link>
    </nav>
  );
}