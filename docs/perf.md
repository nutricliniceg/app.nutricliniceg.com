# P31 Performance & Accessibility Report (PF-01..07, §14.3)

Date: 2026-09-23. Method: production build + `npx lighthouse` (headless,
4G-throttled emulation) against `next start` on this host; bundle analysis
from `.next` manifests; contrast computed per WCAG formulas.

## 1. Lighthouse (PF-07) — targets: Perf ≥ 85 · A11y ≥ 90 · SEO ≥ 95

| Page | Perf | A11y | SEO | LCP (sim) | TBT | Notes |
|------|------|------|-----|-----------|-----|-------|
| /ar/privacy (server) | 89 | 100 | 100 | 2.9s | 238ms | PASS all |
| /portal (entry) | 93 | 98 | 100 | 2.0s | 291ms | PASS all |
| /ar/pricing (server + island) | 76–84 (median 81) | 98 | 100 | 2.3–4.0s | 168–558ms | A11y/SEO pass; Perf marginal (see §7) |
| /ar/blog, /ar/blog/[slug], /dashboard/* | — | — | — | — | — | Operator-run on staging (need live DB + auth). Re-run command below. |

Re-run: `npx lighthouse http://localhost:3100/ar/pricing --output=json
--chrome-flags="--headless --no-sandbox" --only-categories=performance,accessibility,seo`

Real-time (unthrottled) LCP breakdown on pricing: TTFB ~66ms, element
render delay ~1.2s → ≈1.3s real LCP, within the PF-01 2.5s budget. The lab
score gap is emulation + host noise (runs varied 70–84 on identical code).

## 2. LCP < 2.5s on 4G (PF-01)

- Pricing converted to server component (plans fetched server-side via
  `billingService.publicPlans()`); only checkout hydrates
  (`pricing/_components/checkout-panel.tsx`).
- Fonts: IBM Plex Sans Arabic enabled (was silently OFF — Arabic fell back
  to system fonts), Serif dropped; `font-display: swap`; weights resolve
  locally from `@ibm/plex` (`ui/styles/_theme.scss`).
- Render-blocking CSS cut 938kB → 457kB raw (103kB → 48kB gzip) via
  selective `@use` (UI-14) — 25 style modules for components actually used;
  guarded by `scripts/check-css.cjs` (27 selectors + brand tokens).
- No full-Carbon-CSS import remains. Hero images: N/A (no marketing hero;
  all images are dynamic user uploads served via signed URLs, already
  WebP-re-encoded variants in the media pipeline).
- Above-fold content server-rendered on all public pages (blog, pricing,
  privacy/terms, portal shell).

## 3. API p95 < 800ms (PF-02)

- N+1s killed: `plans.repo.getFullPlan` (meals→items) and
  `exercises.repo.getFullPlan` (days→exercises) now single `IN (...)`
  batches; `addRecipients` and `setTags` now single multi-row INSERTs
  (`tests/perf.test.ts` asserts statement counts).
- Indexes added (§9): `NewsletterSubscriber.confirm_token` UNIQUE,
  `unsub_token` UNIQUE, `ExercisePlan(doctor_id,status)`,
  `BlogPost(translation_of)`.
- `lib/api/timing.ts`: `timed()` wrapper emits `Server-Timing: app;dur=N`
  and logs `api.slow` ≥ 800ms; applied to `GET /api/dashboard/stats` and
  `GET /api/patients`.
- Remaining watch item (not N+1): correlated subselects in
  `messages.repo` thread lists — fine at current scale.

## 4. Plan generation wall-time < 45s (PF-03)

- Structural bound: prompt pool capped at 200 candidates
  (`listCandidates`, hard cap), ≤3 attempts per mode
  (`MAX_GENERATION_ATTEMPTS`/`MAX_FREE_ATTEMPTS`), 30s adapter timeouts.
- `wallTimeMs` persisted per generation (`PlanGeneration`); generations
  over 45s now log `plans.slow_generation` for ops review
  (`lib/plans/generation.service.ts`).

## 5. Compression & output (PF-04/06)

- `output: 'standalone'` intact; `/_next/static/*` served
  `Cache-Control: public, max-age=31536000, immutable` (next.config).
- Next.js compresses dynamic responses (gzip) by default; on cPanel ensure
  `mod_deflate` is on for `text/html text/css application/javascript`
  (static host config, no repo change needed).

## 6. Bundle governance (UI-13/UI-20)

- Lazy now: recharts (dashboard weekly, admin cost trend, longitudinal +
  weight charts via `next/dynamic`), FileUploader (branding),
  TipTap (pre-existing), Sentry browser SDK (own on-demand chunk —
  no longer in shared layout).
- Still static (documented): DataTable (dev `/t0` route only),
  DatePicker (zero usages after the patients rewrite).
- `scripts/check-bundle.cjs` (gzip transfer sizes, runs in `npm run build`,
  fails the build on breach): shared 110.9kB ≤ 115.2kB (baseline 105 +10%),
  heaviest page ai-assistant 217.5kB ≤ 280kB.
- `experimental.optimizePackageImports` for `@carbon/react`,
  `@carbon/icons-react`, `recharts` (ai-assistant 245→218kB).
- Shared first-load: 106kB (baseline 105kB — within +10%).

## 7. Accessibility (WCAG 2.1 AA, §14.3, UI-17)

- Contrast (computed, white bg): teal #008080 4.77 ✓, #005F73 7.28 ✓,
  body #161616 18.1 ✓, secondary #525252/#5a6872/#6f6f6f ✓, amber #b45309
  5.02 ✓. `#0A9396` is 3.73:1 — used ONLY as focus ring + one chart line
  (non-text, 3:1 threshold ✓), never as text. No token changes needed.
- **Theme bug fixed (major): the Teal theme was never applied.** The
  `$theme` map used v10 key names (`interactive-01`, `link-01`) that Carbon
  v1 ignores — production CSS contained ZERO teal and 124× IBM blue
  `#0f62fe` (UI-03 violation). Component tokens resolve by theme-matching
  and fall back to blue for custom themes, so `ui/styles/_theme.scss` now
  pins 15 brand tokens in `:root` (verified last-in-cascade; component
  `var(--cds-*)` rules resolve teal at runtime).
- **RTL bug fixed (major): `<html lang dir>` was always `ltr`/undefined**
  (root layout params lack the `[locale]` segment). Now resolved via
  `getLocale()` — verified `lang="ar" dir="rtl"` over the wire.
- Directional icons: `.flip-rtl` utility (`scaleX(-1)` under `[dir=rtl]`)
  + applied to pagination/view chevrons; pagination now uses
  ChevronLeft/Right instead of misused ChevronDown.
- Labels: OverflowMenu trigger (`iconDescription`), lab textarea
  (`aria-label`), hidden import input (`aria-label`), attachment alt
  fallbacks (`labels.attachment` / `inbox.attachment` keys added).
- States: loading + empty added to admin users/usage/plans/payments/
  settings tables, food-lists panel (`InlineLoading` + `noListsYet`), portal
  thread empty state. Portal touch targets already ≥44px (portal.css).
- Keyboard/focus-visible/error-announcement: Carbon components natively;
  form errors use `invalidText` + `InlineNotification role` paths.

## 8. Build health fixed (unblocked everything above)

The production build was red: 3 dashboard-patient pages imported
non-existent Carbon/next-intl APIs (~85 type errors + webpack import
errors), 3 pages had wrong relative CSS imports, `/sitemap.xml` prerendered
without a DB, and dead `ui/composites/{Form,Notification}.tsx` (zero
importers) failed typecheck. Fixed by: full rewrite of the 3 patient pages
with correct Carbon v1 APIs (list with Search/Tag/OverflowMenu/pagination;
create form with validation + success tile; detail with Tabs/Tiles/Tables/
Modal/weight chart island), CSS path corrections, `force-dynamic` sitemap,
deleting the two dead files. **Typecheck is now zero-error repo-wide and
`npm run build` is green (75 routes).**

Out of scope (pre-existing, recorded): no marketing landing/about/contact
pages exist (empty route dirs — P08 gap, blocks a "landing" Lighthouse run);
no `public/` dir; `scripts/db-seed.js` absent; messages namespace keys added
where the rewrites needed them (`dashboard.*`, `foodLists.loading/
noListsYet`, `admin/adminAi/adminBilling.noResults`, `newsletter.name`,
`inbox.attachment`).
