import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import LocaleSwitch from './locale-switch';

/**
 * Shared public page chrome: brand + primary nav + the locale switch
 * (P32-DESIGN Defect 4). Mounted on home, pricing, blog index and the blog
 * article so the switcher is reachable from every public surface, matching the
 * pre-P32-DESIGN behaviour.
 *
 * Server component; all strings come from messages/*.json.
 */
export default async function SiteHeader({
  locale,
  pathname,
  search,
}: {
  locale: string;
  pathname: string;
  search?: string;
}) {
  const t = await getTranslations({ locale, namespace: 'home' });
  const loc = locale === 'en' ? 'en' : 'ar';

  const links = [
    { href: `/${loc}`, label: t('title') },
    { href: `/${loc}/pricing`, label: t('pricing') },
    { href: `/${loc}/blog`, label: t('blog') },
    { href: `/${loc}/privacy`, label: t('privacy') },
    { href: `/${loc}/terms`, label: t('terms') },
  ];

  return (
    <header
      style={{
        borderBottom: '1px solid var(--cds-border-subtle, #e0e0e0)',
        background: 'var(--cds-layer-01, #fff)',
      }}
    >
      <div
        className="nc-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          paddingBlock: '1rem',
        }}
      >
        <nav aria-label="primary" style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{ color: 'var(--cds-text-primary, #161616)', textDecoration: 'none' }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link
            href={`/${loc}/login`}
            style={{ color: 'var(--cds-link-primary)', textDecoration: 'none', fontWeight: 600 }}
          >
            {t('login')}
          </Link>
          <LocaleSwitch pathname={pathname} search={search} />
        </div>
      </div>
    </header>
  );
}