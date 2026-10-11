import type { ReactNode } from 'react';
import SiteHeader from './site-header';
import SiteFooter from './site-footer';

/**
 * P32-DESIGN-2 — the one shared page shell for every public surface.
 *
 * Before this pass each page assembled its own `<div><main>` and several of them
 * (login, privacy, terms, the localized 404, the blog taxonomy pages) never
 * mounted the header or the locale switcher at all, so they read as a different
 * product from /pricing and /blog. Every public page now composes this instead,
 * which is what makes "same shell" verifiable rather than aspirational.
 *
 * Pure composition — it adds no markup of its own beyond the container, so the
 * header/footer behaviour is identical to the pages that mounted them directly
 * in P32-DESIGN.
 */
export default function PublicShell({
  locale,
  pathname,
  search,
  children,
  container = true,
  containerClassName = '',
  mainClassName = '',
}: {
  locale: string;
  pathname: string;
  search?: string;
  children: ReactNode;
  /** Set false for pages that manage their own full-bleed container. */
  container?: boolean;
  containerClassName?: string;
  mainClassName?: string;
}) {
  return (
    <div className={container ? `nc-container ${containerClassName}`.trim() : containerClassName}>
      <SiteHeader locale={locale} pathname={pathname} search={search} />
      <main className={mainClassName}>{children}</main>
      <SiteFooter />
    </div>
  );
}