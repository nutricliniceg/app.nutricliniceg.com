import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@carbon/react';
import PublicShell from './_components/public-shell';
import { blogService } from '@/lib/blog/blog.service';
import { templatesRepository } from '@/lib/db/repositories/templates.repo';

/**
 * Public landing home (/:locale).
 *
 * P32-DESIGN: replaced the four-link stopgap with the designed landing —
 * hero + value props + how-it-works + seeded template names + blog teaser +
 * CTA. Every string comes from messages/{ar,en}.json; colours come from
 * Carbon tokens via ui/styles/_public.scss.
 *
 * P32-DESIGN-2: renders through the shared PublicShell (header + locale
 * switcher + footer) instead of assembling its own chrome. `container={false}`
 * because this page is full-bleed by design — each section carries its own
 * `.nc-container`.
 *
 * THE ZERO-DB-404 RULE IS PRESERVED: this page is wrapped in one try/catch and
 * calls notFound() nowhere, so an empty database renders the full marketing
 * page with empty-state copy instead of throwing.
 */
export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = (await searchParams) ?? {};
  const search = new URLSearchParams(
    Object.entries(sp).map(([k, v]) => [k, String(v)] as [string, string])
  ).toString();
  const loc: 'ar' | 'en' = locale === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale: loc, namespace: 'home' });

  let templates: Array<{ id: string; name: string; category: string | null }> = [];
  let posts: Array<{ id: string; slug: string; title: string; excerpt: string | null; reading_minutes: number }> = [];
  try {
    templates = await templatesRepository.listVisible('', { type: 'nutrition', sort: 'usage' });
  } catch {
    templates = [];
  }
  try {
    posts = (await blogService.list(loc, 1)).posts.slice(0, 3);
  } catch {
    posts = [];
  }

  const values = [
    { title: t('value1Title'), body: t('value1Body') },
    { title: t('value2Title'), body: t('value2Body') },
    { title: t('value3Title'), body: t('value3Body') },
    { title: t('value4Title'), body: t('value4Body') },
  ];
  const steps = [
    { title: t('how1Title'), body: t('how1Body') },
    { title: t('how2Title'), body: t('how2Body') },
    { title: t('how3Title'), body: t('how3Body') },
  ];

  return (
    <PublicShell locale={loc} pathname={`/${loc}`} search={search} container={false}>
      <>
        <section className="nc-hero">
          <div className="nc-container">
            <h1 className="nc-hero__title">
              {t('heroTitle')} <span className="nc-hero__accent">{t('heroTitleAccent')}</span>
            </h1>
            <p className="nc-hero__subtitle">{t('heroSubtitle')}</p>
            <div className="nc-hero__actions">
              <Button as={Link} href={`/${loc}/pricing`} kind="primary" size="lg">
                {t('heroCtaPrimary')}
              </Button>
              <Button as={Link} href={`/${loc}/login`} kind="tertiary" size="lg">
                {t('heroCtaSecondary')}
              </Button>
            </div>
            <div className="nc-hero__stats">
              <div className="nc-hero__stat">
                <strong>3</strong>
                <span>{t('heroStat1')}</span>
              </div>
              <div className="nc-hero__stat">
                <strong>ar / en</strong>
                <span>{t('heroStat2')}</span>
              </div>
              <div className="nc-hero__stat">
                <strong>CMP-04</strong>
                <span>{t('heroStat3')}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="nc-section nc-container">
          <h2 className="nc-section__title">{t('valueTitle')}</h2>
          <p className="nc-section__subtitle">{t('valueSubtitle')}</p>
          <div className="nc-cardgrid">
            {values.map((v) => (
              <article className="nc-card" key={v.title}>
                <h3 className="nc-card__title">{v.title}</h3>
                <p className="nc-card__body">{v.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="nc-section nc-container">
          <h2 className="nc-section__title">{t('howTitle')}</h2>
          <p className="nc-section__subtitle">{t('howSubtitle')}</p>
          <div className="nc-cardgrid nc-steps">
            {steps.map((s) => (
              <article className="nc-card" key={s.title}>
                <h3 className="nc-card__title">{s.title}</h3>
                <p className="nc-card__body">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="nc-section nc-container">
          <h2 className="nc-section__title">{t('templatesTitle')}</h2>
          <p className="nc-section__subtitle">{t('templatesSubtitle')}</p>
          {templates.length === 0 ? (
            <p className="nc-card__body">{t('templatesEmpty')}</p>
          ) : (
            <div className="nc-cardgrid">
              {templates.slice(0, 8).map((tpl) => (
                <article className="nc-card" key={tpl.id}>
                  <h3 className="nc-card__title">{tpl.name}</h3>
                  {tpl.category && (
                    <p className="nc-card__body">
                      <span className="cds--tag">{tpl.category}</span>
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="nc-section nc-container">
          <h2 className="nc-section__title">{t('blogTitle')}</h2>
          <p className="nc-section__subtitle">{t('blogSubtitle')}</p>
          {posts.length === 0 ? (
            <p className="nc-card__body">{t('blogEmpty')}</p>
          ) : (
            <div className="nc-postgrid">
              {posts.map((p) => (
                <article className="nc-post" key={p.id}>
                  <div className="nc-post__body">
                    <h3 className="nc-post__title">
                      <Link href={`/${loc}/blog/${p.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        {p.title}
                      </Link>
                    </h3>
                    <p className="nc-post__excerpt">{p.excerpt ?? ''}</p>
                    <Link className="nc-post__more" href={`/${loc}/blog/${p.slug}`}>
                      {t('blogReadMore')} →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="nc-section nc-container">
          <div className="nc-card">
            <h2 className="nc-section__title">{t('ctaTitle')}</h2>
            <p className="nc-section__subtitle">{t('ctaBody')}</p>
            <Button as={Link} href={`/${loc}/pricing`} kind="primary" size="lg">
              {t('ctaButton')}
            </Button>
          </div>
        </section>
        <p
          className="nc-container nc-footer__note"
          style={{ color: 'var(--cds-text-secondary)', fontSize: '0.85rem' }}
        >
          {t('footerNote')}
        </p>
      </>
    </PublicShell>
  );
}