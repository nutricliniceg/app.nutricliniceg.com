# NutriClinicEG Progress Log

## STATE SNAPSHOT
- **Modules Completed:** P01–P32 (CI/CD + cPanel deployment runbook; target: app.nutricliniceg.com) + P32 gitleaks-allowlist fix
- **P32-fix (gitleaks allowlist):** `.gitleaks.toml` (NEW — test-fixture allowlist for `tests/env.test.ts` + `tests/setup.ts` only, defaults extended, SEC-06 intact elsewhere) + `ci.yml` (MODIFIED — gitleaks step now uses `config-path: .gitleaks.toml`); verified no hardcoded secrets outside `tests/`; commit `1060fd3` pushed to main; CI green pending user confirm (no `gh` CLI on this machine).
- **Key Files Map (P32 additions):**
  - `.github/workflows/ci.yml` (NEW) — PR gate: npm ci → lint → typecheck → tests → gitleaks → build (server never builds, UI-19)
  - `.github/workflows/deploy.yml` (NEW) — tag/manual deploy: CI build → artifact → SSH upload → releases/NNN symlink switch (keep 2, R7) → Passenger restart → smoke verify → auto-rollback
  - `.github/dependabot.yml` (NEW, weekly; Carbon/Next/React excluded from auto-merge, UI-20) + `.github/pull_request_template.md` (NEW, QA-06 checklist)
  - `scripts/smoke-staging.cjs` (NEW, verified: correct PASS/FAIL behavior) + `scripts/db-create.sql` (NEW: `nutriapp_prod/_stage/_verify`, CREATE-only, no touch of existing DBs)
  - `docs/deploy-runbook.md` (NEW) — secrets table, new-app cPanel steps, first-deploy checklist, rehearsed rollback, backup reference
  - Verification: `tsc` clean, `eslint` 0 errors, `vitest` 320/320 green (44 files); full `npm run build` not re-run (unchanged since P31 green)
- **Key Files Map (QGATE-3 additions):**
  - `lib/db/repositories/maintenance.repo.ts` (NEW) — health ping, rate-limit count/increment, cron cleanup deletes, newsletter housekeeping, stale-activations lookup
  - `lib/db/repositories/privacy.repo.ts` (NEW) — allowlisted CMP-04 export tables + hardDeleteUser
  - `lib/admin/privacy.service.ts`, `lib/security/rate-limit.ts`, `lib/cron/tasks.ts`, `app/api/health/route.ts` — delegate to repos, zero SQL
  - `tests/quality-layering.test.ts` (NEW, 3 tests) — unknown-table guard + no-SQL-in-service/routes assertions
  - Verification: `tsc` clean, `eslint` 0 errors, `vitest` 320/320 green (44 files)
- **Key Files Map (P31 additions):**
  - `docs/perf.md` — Lighthouse table (privacy 89/100/100, portal 93/98/100, pricing median ~81/98/100), bundle numbers, contrast report, NFR evidence
  - `ui/styles/_theme.scss` — selective Carbon `@use` (25 modules; CSS 938→457kB raw, 103→48kB gzip) + 15 `:root` brand tokens (FIXED: teal was never applied — v10 key names ignored, prod CSS was 124× IBM blue) + Arabic fonts on/Serif off; `scripts/check-css.cjs` (NEW, wired into build)
  - `app/layout.tsx` — locale via `getLocale()` (FIXED: `<html>` was always `ltr`/undefined — root params lack `[locale]`)
  - `app/[locale]/dashboard/patients/{page,new/page,[id]/page}.tsx` — full rewrite with correct Carbon v1 APIs (was ~85 type errors + webpack import errors blocking every build); deleted dead `ui/composites/{Form,Notification}.tsx`; typecheck zero-error repo-wide, `npm run build` green (75 routes)
  - `app/[locale]/pricing` — server component + `checkout-panel.tsx` island (SSR above-fold); `app/[locale]/dashboard/{page,_components/weekly-chart}` + `admin/cost/_components/cost-trend` + `patients/[id]/_components/{longitudinal-chart,weight-chart}` + `settings/_components/logo-uploader` — recharts/FileUploader via `next/dynamic`; Sentry SDK own on-demand chunk; `optimizePackageImports` (ai-assistant 245→218kB)
  - `scripts/check-bundle.cjs` (NEW, wired into build) — gzip gate: shared 110.9 ≤ 115.2kB, heaviest page ≤ 280kB
  - `lib/api/timing.ts` (NEW) — `Server-Timing` + ≥800ms slow log on hot routes; N+1s batched (plans/exercises `IN()`, multi-row inserts); 4 new indexes; `timed()` on dashboard-stats/patients-list
  - A11y: `.flip-rtl` + chevron fixes, OverflowMenu/textarea/file-input labels, attachment alt fallbacks, loading+empty states on 5 admin tables + food-lists + portal thread; `lib/plans/generation.service.ts` slow-generation warn; `next.config.ts` immutable static caching
  - `tests/perf.test.ts` — 5 tests (batch statement counts, Server-Timing)
- **Key Files Map (P30 additions):**
  - `docs/security-checklist.md` — PASS/FAIL per SEC/CMP item (10 FAILs found, all fixed same-pass)
  - `middleware.ts` — per-request nonce CSP (no unsafe-inline/unsafe-eval for scripts), matcher extended to `/api/:path*` (JWT/CSRF/admin guards now cover API), `x-request-id` + `x-nonce` propagation; static unsafe CSP removed from `next.config.ts`
  - `lib/security/{csrf,field-crypto}.ts` (NEW) — testable Origin check (suffix-fooling rejected); `enc:v1:` AES-GCM medical-field helpers with legacy passthrough
  - `lib/db/repositories/visits.repo.ts` — `Visit.notes` encrypted at rest (transparent migrate-on-write)
  - `lib/cms/legal.ts` + `app/[locale]/{privacy,terms}` — public legal pages (CMS-overridable, plain-text render)
  - `AiProvider.data_retention` end-to-end (schema + repo + admin PATCH + chain `RETENTION_UNKNOWN` fail-closed, wired at 6 patient-data call sites)
  - `lib/admin/privacy.service.ts` + `app/api/admin/users/[id]/privacy` — CMP-04 export (audited JSON) / erase (`?confirm=erase`, self-erase blocked)
  - Weekly cleanup also scrubs `AiUsageLog.error_message` > 6mo (CMP-05); `docs/key-rotation-and-breach-runbook.md` (90-day overlap, JWT/ENCRYPTION/FILE_URL rotation, 72h breach runbook)
  - `tests/security/abuse-probes.sh` (10 curl probes) + `tests/security.test.ts` — 8 handler-level negatives
- **Key Files Map (P29 additions):**
  - `lib/cron/{registry,tasks,runner}.ts` — 15 registered tasks (CRON-01/03/04/05/06/07/08/09/10/11/12/13/14/15 + backup-verify), `x-cron-secret` gate (404 otherwise), CronRun ledger, admin alert after 2 consecutive failures; all handlers idempotent (existing sent-flags/uq-keys/claimDue/locks reused)
  - `lib/backup/backup.service.ts` — AES-256-GCM mysqldump, 7/4/3 retention, S3 PUT when env present else locked local dir, weekly scratch-restore + row-count checksums → `BackupReport`
  - `lib/observability/{logger,sentry}.ts` + `instrumentation.ts` + `app/sentry-init.tsx` (wired in root layout) — JSON logs with request-id, Sentry with PHI scrub
  - `lib/db/repositories/cron.repo.ts` (NEW) + schema §55 `CronRun` / §56 `BackupReport`
  - `app/api/cron/[task]` (unified runner) + `app/api/health` (db/smtp-cached/ai/cron, no secrets) + `app/[locale]/admin/health` dashboard with OBS-04 alerts + legacy newsletter cron now also accepts `x-cron-secret`
  - `middleware.ts` — `x-request-id` generate + echo; `docs/cron-operations.md` — 15 cPanel lines + RPO/RTO + quarterly drill; `tests/cron.test.ts` — 8 tests
- **Key Files Map (P28 additions):**
  - `lib/newsletter/{campaign.schema,campaigns.service}` — custom campaigns, auto-from-post (first-publish-only lock, +15min schedule, per-locale with fallback rule), cancel-for-post, preview/test-send, launch queue build, CRON-11 batch (50/batch, 3-attempt cap, send-time suppression re-check, per-recipient errors), click-tagged links (no open-pixel)
  - `lib/db/repositories/campaigns.repo.ts` (NEW) — campaign CRUD + uq(campaign,subscriber) dedupe enqueue + due/nextBatch/retryable/report/click counters
  - `app/api/admin/newsletter/campaigns` (list/create + ?launch, cancel, report view) + `[id]` (edit/test/launch, locked after launch) + `app/api/cron/newsletter` (CRON_SECRET, 404 otherwise) + `app/api/newsletter/click` (count + 302)
  - `lib/blog-admin/posts.service.ts` — best-effort auto-create on publish/publishDue + cancel on unpublish/archive + newsletter_sent_at stamp (publish never breaks on campaign failure)
  - `app/[locale]/admin/newsletter/campaigns` (create/launch/test/report/cancel) + `messages/{ar,en}.json` campaign keys; `tests/campaigns.test.ts` — 8 tests
- **Key Files Map (P27 additions):**
  - `lib/newsletter/{newsletter.schema,tokens-csv,newsletter.service,index}.ts` — double opt-in (pending → 48h single-use confirm), neutral duplicate/suppression responses, honeypot, one-click unsubscribe (idempotent), suppression gate for all sends, CSV import (pending-only, never resurrects) / export
  - `lib/db/repositories/subscribers.repo.ts` (NEW) — full subscriber CRUD + stats + confirmed-only reader for P28
  - `app/api/newsletter/subscribe` (Turnstile-aware, 5/h/IP) + `app/api/admin/newsletter/subscribers` (list/stats/add/hard-delete/import/export, audited) + branded confirm/unsubscribe pages (identical outcomes, no enumeration)
  - Shared `SubscribeForm` wired into blog CTA + new site footer on pricing (CMS landing renderer absent — ledger)
  - `app/[locale]/admin/newsletter/subscribers` (stats, filters, import/export, hard delete) + live admin nav link
  - `messages/{ar,en}.json` — `newsletter` + `adminNewsletter` ns; `tests/newsletter.test.ts` — 8 tests (suppression, single-use/expiry, unsub + re-entry block, neutral dupes, honeypot, CSV round-trip + import)
- **Key Files Map (P26 additions):**
  - `lib/blog-admin/{post.schema,slug,markdown,preview,posts.service,media.service,index}.ts` — CRUD + transliterated unique slugs, md-canonical round-trips, Word-paste cleaner, signed preview tokens, revisions (cap 20) + restore, schedule/publish + CRON-10 hook, EN-clone linking (no MT), newsletter lock, sharp WebP variants + alt/mime/size gates
  - `lib/db/repositories/{blog-admin,taxonomy,media}.repo.ts` (NEW) — posts/revisions/taxonomy/media + untranslated report + reference-guarded delete
  - `app/api/admin/blog/*` (posts CRUD, ops, bulk, revisions, taxonomy, media) + `app/api/media/[id]` (public cached) + `app/blog/preview` (signed, noindex, no view++)
  - `app/[locale]/admin/blog/` (list with badges/filters/bulk, lazy TipTap editor with toolbar + BubbleMenu + shortcuts + paste/drop + per-block dir, SEO/SERP panels, lifecycle + revisions + media picker + taxonomy + media library)
  - `prisma/schema.sql` — `BlogPost.guest_author` (existing DBs: one-line ALTER); `messages/{ar,en}.json` — `blogAdmin` ns
  - `tests/blog-admin.test.ts` — 9 tests (round-trips, paste, slugs, scheduling, restore, real-sharp variants, alt gate, clone, newsletter lock)
- **Key Files Map (P25 additions):**
  - `lib/blog/{blog.schema,seo,render,blog.service,index}.ts` — tagged-cache reads (`blog` tag, no rebuild), bilingual list/slug/translations/related, hreflang (both-only, x-default ar) + self canonical + JSON-LD + RSS + sitemap + markdown export with TOC, heading-id injection, HTML hygiene (script/handler strip, YT/Vimeo-only iframes, lazy images)
  - `lib/db/repositories/blog.repo.ts` (NEW) — published-only queries (locale/category/tag, translations, related, sitemap/llms rows, view++)
  - `app/[locale]/blog/` (index 12/page + rel prev/next, article with SEO metadata + TOC + related, category/tag) + `app/blog/rss.xml` + `app/blog/[slug]` (markdown negotiation, else 308 to canonical) + `app/sitemap.xml` (hreflang alternates) + `app/llms.txt` (dynamic post index)
  - `messages/{ar,en}.json` — `blog` ns; `tests/blog.test.ts` — 12 tests (negotiation, hreflang ×3, /en exclusion, RSS, sitemap, revalidateTag, TOC/hygiene, export)
- **Key Files Map (P24 additions):**
  - `lib/billing/{billing.schema,paymob,lifecycle,billing.service,tasks,index}.ts` — Paymob Intention (settings-driven, 15s timeout, no auto-retry) + HMAC-SHA512 webhook verify (documented field order, 403), idempotent webhook → auto-activate + extend + welcome email + admin alert, manual submit/review/trial, grace math (3d) + banner states, cron bodies (expire/reminders/reconcile) split to tasks.ts
  - `lib/db/repositories/billing.repo.ts` (NEW) — subscriptions, manual requests, paymob txns, cron candidate queries
  - `app/api/billing/*` (checkout, manual, status, plans-public, paymob webhook) + `app/api/admin/payments/*` (queue, approve/reject with reason rule, trial) — all Zod + ownership + audit
  - `app/[locale]/pricing` (Paymob redirect + manual form), `app/[locale]/admin/payments`, `app/receipt/[id]` (white-label, Q4 tax note), doctor grace/expired banner in dashboard shell
  - `prisma/schema.sql` — Subscription `grace` status + reminder flags, tables 53/54; `messages/{ar,en}.json` — `billing` + `adminBilling` ns
  - `tests/billing.test.ts` — 8 tests (HMAC vectors + tamper, route 403, replay, auto-activation, grace/banners, manual flows, reconcile diff)
- **Key Files Map (P23 additions):**
  - `lib/admin/ai-gateway.service.ts` — provider list/update/reorder (validated full-set), keys add/edit/rotate/delete (encrypted, hint-only), masked security view, password-policy + turnstile setters, cost dashboard (USD + EGP via settings rate), CSV builder
  - `lib/auth/password-policy.ts` (NEW) + `lib/auth/turnstile.ts` (settings-first, env fallback, signatures preserved) — policy enforced in register/reset/change, expiry enforced at login (PASSWORD_EXPIRED), Turnstile consumed via isTurnstileRequired in 3 auth routes
  - `lib/db/repositories/ai.repo.ts` (+provider/key admin ops, usage explorer, cost aggregates, key stats) + `audit.repo.ts` (+read-only list; no writers exist)
  - `app/api/admin/*` (ai-providers + reorder + keys + probe + key meta/rotate/delete, ai-usage, ai-cost + CSV export audited, audit super-only, security GET/PUT) — all Zod + role gates + audit
  - `app/[locale]/admin/` (ai-providers with DnD reorder + ping + masked keys, security, audit viewer, cost with Recharts trend + top consumers + CSV, usage explorer)
  - `prisma/schema.sql` — `User.password_changed_at` (existing DBs: one-line ALTER); `messages/{ar,en}.json` — `adminAi` ns + nav keys
  - `tests/ai-gateway.test.ts` — 6 tests (reorder→chain order, masked serialization, encrypt-at-rest, sensitive gate, cost math + CSV)
- **Key Files Map (P22 additions):**
  - `lib/admin/{admin.schema,users.service,pricing.service,settings-admin.service,bulk-email.service,index}.ts` — user list/activate/notify/edit/subscription-adjust, pending queue + bulk + reject-with-reason, super-gated pricing, sensitive-gated settings, bulk fan-out with per-recipient tracking + retry
  - `lib/db/repositories/{admin,subscription-plans,cms,admin-messages,contacts}.repo.ts` (NEW) + `errors.repo` (list/resolve) + `settings.repo` (+list) + `users.repo` (+listAllForBroadcast)
  - `app/api/admin/*` (14 routes: overview, users, subscription, activations + bulk + reject, plans + [id], cms, settings + test-email, bulk-email + retry, errors, contacts) + public `POST /api/contact` intake (fills P08 gap, IP-hashed, rate-limited)
  - `app/[locale]/admin/` shell (full SideNav + pending/contacts badges, future modules tagged P23/P26/P28) + 9 pages (overview, users, activations with >24h highlight, subscriptions, plans, cms, settings, bulk-email, errors, contacts)
  - `prisma/schema.sql` — `SystemErrorLog.resolution_note` (existing DBs: one-line ALTER); `messages/{ar,en}.json` — `admin` + `adminNav` ns
  - `tests/admin.test.ts` — 6 tests (pricing matrix, sensitive-settings matrix, fan-out + retry, activation emails + guards, subscription math)
- **Key Files Map (P21 additions):**
  - `lib/assistant/{assistant.schema,context,assistant.service,index}.ts` — chat UI backend: conversations (auto-title, rename, pin, archive, search title+content, 30-day trash/restore with expiry), patient link/unlink with change-warning confirm gate, server-assembled de-identified context (metrics, trend, active plans, allergies, labs, file inventory), per-message vision attachments, exact outbound persisted as system snapshot, markdown export, consent capture, lab-analyze reuse; EVERY patient-context send audited
  - `lib/db/repositories/ai-conversations.repo.ts` (NEW; tables 19/20 pre-existed — zero migrations) + `patients.repo.setConsentAiSharing`
  - `lib/security/deidentify.ts` (NEW) — literal-secret strip + pattern scrub (order fixed after a failing test caught email-breakage); `errors.service.scrubPhi` now reuses it (behavior identical, labs.test green)
  - `app/api/ai-assistant/*` (9 routes: conversations CRUD, send, restore, export, payload, patient link/unlink, consent, lab-analyze; quota 429 mapping)
  - `app/[locale]/dashboard/ai-assistant/` — list + chat + disclaimer banner on every AI reply + patient chip + consent flow + what-was-sent modal + retention flags + lab panel; `react-markdown` + `dompurify` added per PRD §5.1 stack
  - `messages/{ar,en}.json` — `assistant` ns; `tests/assistant.test.ts` — 6 tests (context+PII, scrubber, consent gate+capture, trash lifecycle, disclaimer+history, change warning)
- **Key Files Map (P20 additions):**
  - `lib/messages/{messaging.schema,messaging.service,index}.ts` — thread model over PatientMessage, doctor list/get/reply/read/archive/unarchive, sender-only 5-min delete (both sides), unread summary + CRON-06 digest hook, portal thread/delete, image validation (owned image, patient-linked), reply emails to link notify_email (skipped when absent — patients have no accounts/addresses)
  - `lib/db/repositories/messages.repo.ts` (extended, not replaced) — findById, listThreads (JOIN + unread badges), unreadSummary, markThreadRead, deleteById, setThreadArchived; `self-reports.repo.ts` (NEW) — weight records linked to weight_log messages
  - `app/api/messages/*` (threads, thread, reply, read, archive/unarchive, unread-summary, [id] delete — all Zod + ownership + audit) + portal `thread`/`upload` (token image upload, 10MB magic-gated)/`messages/[id]` (audited patient delete)
  - `app/[locale]/dashboard/inbox/` — thread list with badges, type renderers (weight card, measurement table, image thumbs), reply, 60s unread-summary poll + SideNav inbox badge
  - Portal: thread section with replies + own-delete, message composer with image attach
  - Charts: self-reports merged into AI-summary trend + additive `selfReports` in patient detail (canvas overlay in pre-existing broken P10 panel → P31)
  - `prisma/schema.sql` — table 52 `PatientSelfReport`, `PatientMessage.archived`, `PatientPortalToken.notify_email`; middleware protects `/api/messages`; `messages/{ar,en}.json` — `inbox` ns
  - `tests/messaging.test.ts` — 9 tests (unread/summary, read+archive, 5-min boundary ×3, payload round-trip + reply email, email skip, attachment gate, 20/h rate limit)
- **Key Files Map (P19 additions):**
  - `lib/portal/{portal.schema,permissions,portal.service,index}.ts` — UUID tokens, JSON permissions (view_plans/send_weight/send_note/message), 7/30/60/90-day expiry, single PORTAL_INVALID for wrong/expired/revoked, access counters, read-only context (active plans, 5g grams, P18 calorie flag, videoIds), weight/note/message submissions as PatientMessage rows (current_weight_kg never auto-mutated), doctor in-app + best-effort email notify
  - `lib/db/repositories/{portal-tokens,messages}.repo.ts` — token CRUD + touch + thread insert/list (P20 extends messages.repo, not replaces)
  - `app/api/patients/[id]/portal-tokens/` (GET/POST + DELETE revoke, audited) + `app/api/portal/[token]/` (GET context, POST weight/note/message; per-token read/write rate limits)
  - `app/portal/` (entry page + `[token]` home/plan/forms, mobile-first CSS, inline YT embeds) + `app/p/[token]` (301 alias, D-04)
  - Doctor generator modal (validity + permission checkboxes + CopyButton + revoke list) wired into patient header (3 minimal insertions, zero new typecheck errors)
  - `prisma/schema.sql` — table 51 `PatientPortalToken`; `RATE_LIMITS.portalRead/portalWrite`; `messages/{ar,en}.json` — `portalTokens` ns + dashboard `portalLink`
  - `tests/portal.test.ts` — 7 tests (generic-error uniformity, access counters, permission gates + API block, weight lands in file + notify, email-failure safety, 301)
- **Key Files Map (QGATE-2 additions/fixes):**
  - `lib/plans/plan-weeks.service.ts` (NEW, 164 lines) — adaptiveRecompute + cloneWeek moved verbatim from bulk.service.ts (394→243 lines); 2 routes rewired, behavior identical
  - `lib/api/fetch-json.ts` (NEW) — single `readApi` replacing 17 copy-pasted component copies (food-lists types.ts now re-exports it)
  - `lib/errors/fail.ts` (NEW) — single `serviceFail` replacing 6 identical local factories; `lib/plans/errors.ts` is now a compatibility re-export (names + 'GENERATION_FAILED' fallback preserved)
  - `lib/db/repositories/errors.repo.ts` (NEW) — SystemErrorLog SQL moved out of errors.service (last SQL outside repositories; UUID now app-side randomUUID like every other repo)
  - `lib/api/validation.ts` — parseJsonBody/validateQueryParams delegate to fail()/failZod() (one response shape)
  - Cross-feature imports routed via public barrels (`@/lib/plans`, `@/lib/exercises`); no cycles (verified: plans/foods/nutrition/ai import nothing upward)
  - Deleted stale duplicate `app/api/exercise-plans/[id]/adaptive/` (P17 leftover shadow route)
  - `tests/plan-weeks.test.ts` (3) + `tests/quality-gate.test.ts` (5: branding guards, print-auth uniformity, template RBAC, adaptive, cross-week copy) + 2 repo SQL tests appended to `tests/repository.test.ts`
  - `tests/*.test.ts` — 217 passing (30 files)
- **Key Files Map (P18 additions):**
  - `lib/print/{print.schema,print-links,branding,views,strings,print.service,index}.ts` — 24h HMAC share links (generic-404 auth), white-label resolve (`file:` refs → fresh signed URLs, platform fallback), pure print-view builders (5g rounding, calorie flag, video thumbs), cookie-or-key loaders over server rows only, branding get/update (logo must be owned image)
  - `app/print/` — layout (no Carbon classes) + `print.css` (A4, page-break, compact tables, .no-print) + nutrition/exercise SSR pages (clinic header, RTL/LTR via ?locale=, PDF hint + print button, no server PDF)
  - `app/api/settings/branding` (GET/PUT) + `app/api/plans/[id]/show-calories` (Q2 flag, default true) + `app/api/print-links` (mint, audited)
  - `app/[locale]/dashboard/settings/` — branding form (clinic name + secure logo upload via P10 uploader)
  - `messages/{ar,en}.json` — `settings` namespace
  - `prisma/schema.sql` — `NutritionPlan.show_calories_to_patient BOOLEAN DEFAULT TRUE` (existing DBs: one-line ALTER); `users.repo` update now allows `clinic_logo_url`; `plans.repo` +updateShowCalories/+findByIdPublic; `exercises.repo` +findPublicById; middleware protects `/api/settings` + `/api/print-links`
  - `tests/print.test.ts` — 8 tests (5g rounding, calorie flag, no-bypass shape, fallback, logo refresh, share-link gates, video thumbs)
- **Key Files Map (P17 additions):**
  - `lib/exercises/{exercises.schema,youtube,scope,exercise-revisions,generation.service,editor.service,index}.ts` — AI wizard (goal/level/equipment → chatJson, server-clamped, pending draft + disclaimer), save (pre/post revisions), approve gate (pending→active, non-empty, archived blocked), bulk day/week/all-weeks (preview + exclusions + undo revision), copy-day (same + cross-week), revisions (append-only, pre-restore backup), adaptive copy-as-new-pending-draft from last-visit weight
  - `lib/db/repositories/exercises.repo.ts` — ExercisePlan/Day/Exercise SQL only (all `?` placeholders)
  - `app/api/exercise-plans/*` — collection (GET list + POST generate), `[id]` (GET/PUT/DELETE), approve, bulk-edit, copy-day, restore-revision (GET+POST), adaptive — all Zod + ownership + audit
  - `app/[locale]/dashboard/exercises/` — new wizard + `[id]` editor (day tabs, HTML5 DnD reorder, bulk/copy-day modals, revisions panel, approve) + nav link
  - `messages/{ar,en}.json` — `exercises` namespace + nav key
  - `prisma/schema.sql` — `ExercisePlanExercise.notes TEXT NULL` (existing DBs: `ALTER TABLE ExercisePlanExercise ADD COLUMN notes TEXT NULL`)
  - `middleware.ts` — `/api/exercise-plans` added to protected prefixes
  - `tests/exercises.test.ts` — 10 tests (scope counts + exclusions, youtube shapes, revision diff, 4 approval gates, AI generation draft + URL hygiene, copy Mon→Thu, undo restore, bulk pre/post revisions)
- **Key Files Map (P16 additions):**
  - `lib/templates/{templates.schema,rescale,templates.service,adaptive.service,index}.ts` — save-as-template (copy-on-save snapshot + reference macros, PT-02/08/09), proportional rescale + P13 reconciler per day (≤5 kcal, PT-03), allergy strip + contraindication report on apply (PT-05), >20% confirm gate (PT-04), adaptive suggest from last-visit weight as NEW pending draft (NP-09, never auto-publishes); global create/edit/archive admin-gated
  - `lib/db/repositories/templates.repo.ts` — PlanTemplate SQL only (insert/listVisible/findVisibleById/incrementUsage/updateById/deleteById, all `?` placeholders)
  - `app/api/templates/route.ts` — GET list (global+own, filters) + POST from plan (Zod + ownership + audit TEMPLATE_CREATED)
  - `app/api/templates/[id]/route.ts` — GET one + PATCH edit + DELETE archive (visibility scope, 404 on foreign, audit TEMPLATE_UPDATED/ARCHIVED)
  - `app/api/templates/[id]/apply/route.ts` — POST apply → draft plan id + removed/warnings report (422 NEEDS_CONFIRMATION without flag, audit TEMPLATE_APPLIED)
  - `app/api/templates/adaptive/route.ts` — POST adaptive suggest (422 NO_ACTIVE_PLAN when none, audit PLAN_ADAPTIVE_SUGGESTED)
  - `app/[locale]/dashboard/templates/` — library page (category groups, search, usage/recent sort) + `_components/` (save-template-form, template-card, apply-modal with large-diff confirm + removal report, adaptive-panel)
  - `messages/{ar,en}.json` — `templates` namespace (31 keys; categories رجيم/سكري/رياضي/نباتي/حمل)
  - `tests/templates.test.ts` — 5 tests (1800→1400 rescale factor, >20% gate, reconciler ≤5, حليب strip, apply immutability + usage bump)
- **Key Files Map (P15 additions):**
  - `lib/plans/{editor.schema,enrich,bulk,revisions,editor.service,bulk.service}.ts` — transactional save (server recompute, scope-checked foods, per-day guard pipeline, active→pending on edit, rails-clamped targets), approve gate (≤5 + all-day re-verify + floor reject + stamps), pre-restore-backup restores (never destructive), diffed revision history, bulk preview/apply (pre+post revisions, undo refs, >2% alert + auto-reconcile), adaptive recompute from visit weight, week clone
  - `lib/plans/day-items.ts` — shared `previewItemValues` (client/server parity by construction)
  - `lib/plans/bulk.ts` fix — foodKey-only anchors (week binds to edited plan)
  - `lib/nutrition/{allergy-guard,pairing,reconciler}.ts` — `foodId: string|null` widening for model items (behavior unchanged)
  - `lib/db/repositories/plans.repo.ts` — meal replace, target/status updates, patient week list, `planRevisionsRepository` (nextNo/insert/list/get)
  - `lib/db/repositories/foods.repo.ts` — `findByIds` (approval enrichment)
  - `app/api/plans/[id]/*` — PUT save, DELETE archive, approve, restore-revision (GET list + POST), bulk-edit (preview/apply), adaptive-recompute, clone-week — all Zod + ownership + audit
  - `app/[locale]/dashboard/plans/[id]/` — editor (live totals, swap/add/remove, HTML5 DnD, week tabs, approve/adaptive/undo, revisions panel, bulk modal with exclusions)
  - `messages/{ar,en}.json` — ~40 `plans` editor keys; dashboard nav `plans` link kept
  - `tests/plan-editor.test.ts` — 10 tests (parity, scope counts 1/1/7/8, exclusions, alert+reconcile, undo exactness, restore integrity, 3 approval gates)
- **Key Files Map (P14 additions):**
  - `lib/plans/{plans.schema,types,errors,targets,day-items,candidates,matching,from-list,ai-free,generation.service,index}.ts` — two-mode generation: candidate pool (admin-first, own-only-on-toggle), §8.2 zod-enforced model output, NP-21 scope rejection + regen, P13 pipeline per attempt (≤3), ai_free path (NUT-10 confirm gate, NUT-21 drop, NUT-12 name guard + caveat, NUT-13 auto-match + ✓, NUT-14 report, NUT-17 fields, NUT-19 mineral notice, >30% publish warning), NUT-16 convert-to-verified + re-reconcile, drafts ALWAYS pending_doctor_approval, params+attempts+wall-time persisted
  - `lib/db/repositories/plans.repo.ts` — extended: plan/meal/item inserts, scoped find/list/full-plan, verification + reconciled updates, `PlanGeneration` insert/find
  - `lib/db/repositories/foods.repo.ts` — P13 mineral columns wired (select/map/insert) + `listCandidates` (global-first, bounded)
  - `app/api/plans/{generate,route,[id],convert-to-verified}` — 4 routes (per-user AI rate limit, quota/503 mapping, audit PLAN_GENERATED/PLAN_CONVERTED_TO_VERIFIED)
  - `app/[locale]/dashboard/plans/new/` — 7-step wizard (ProgressIndicator) + result panel (report, unverified styling, convert button, >30% warning); nav `plans` link (ar/en)
  - `prisma/schema.sql` — `MealItem.food_id` nullable (ai_free), `NutritionPlan.verification_report`, table 50 `PlanGeneration`
  - `tests/plans-generation.test.ts` — 7 tests (e2e reconciled draft, regen path, own-toggle scoping, ai_free ratio/report, confirm gate, NUT-21 drop, convert flow)
- **Key Files Map (P13 additions):**
  - `lib/nutrition/reconciler.ts` — §8.3 deterministic reconciler (per-100g recompute, ≤1 immediate accept, greedy local search on |kcal|+λ·macro over [0.5×,2×] grams, 5g→1g, ≤200 iters, 5g rounding held to ±3, ≤5 accept else needs_retry; emits target/reconciled/deviation/reconciled_at)
  - `lib/nutrition/rails.ts` — DASH-09 absolute floors (1200♀/1500♂ clamp + flag) + BMI-22 ideal-weight helper (reuses exported `MIN_CALORIES` from calc.ts)
  - `lib/nutrition/allergy-guard.ts` — NUT-01/02: admin-mergeable synonym table, normalized name/tag matching, pre-draft strip + save-time hard block
  - `lib/nutrition/contraindications.ts` — NUT-03 caps (kidney 0.8g/kg+K/P/Na/sugar, liver, diabetes, pregnancy/lactation warn-only) + NUT-04 drug–food warnings; unknown minerals → review warning, never block
  - `lib/nutrition/pairing.ts` — §8.4: HARD fish/seafood+egg/dairy per meal, 3 admin-toggleable warnings, server-side re-verification (model claim ignored)
  - `lib/nutrition/pipeline.ts` — NUT-05 mandatory order with first-fail-wins, `MAX_RECONCILE_ATTEMPTS=3`, nearby-target suggestion (never publish off-target)
  - `lib/nutrition/incidents.ts` — NUT-06 `reportIncident` (archive plan + append `qa-regressions/nutrition.jsonl`; audit stays with caller)
  - `lib/db/repositories/plans.repo.ts` — minimal plan find/archive (P14/P15 extend)
  - `prisma/schema.sql` — `FoodItem` +4 nullable mineral columns (K/P/Na/added-sugar per 100g)
  - `tests/nutrition-guards.test.ts` — 20 tests incl. QA-02 500/500 property cases (seeded, deviation ≤5 + rails)
- **Key Files Map (P12 additions):**
  - `lib/ai/types.ts` — `AiClient` contract (chat, chatJson, vision, summarize, extract) + adapter types + per-provider default models
  - `lib/ai/adapters/{http,openai,gemini,anthropic}.ts` — 30s timeouts, exponential backoff on 429/5xx (4xx fail fast), `max_tokens` auto-continuation (AI-06); custom = OpenAI-compatible base URL
  - `lib/ai/vault.ts` — AES-256-GCM key vault (§6.6): ciphertext-only bundles, `key_hint` = prefix + last 4, tamper-evident decrypt
  - `lib/ai/chain.ts` + `attempt.ts` + `chain-limits.ts` — `ChainAiClient`: quota gate → priority-ordered fallback → per-provider attempt (in-memory decrypt, usage log, failure bookkeeping) → retry-queue degradation; `adapterRegistry` overridable seam
  - `lib/ai/quota.ts` — monthly caps (plan `max_ai_calls_monthly` first, else `ai.quota.defaults`), 80% warn notification, 100% bilingual soft-stop, admin bypass
  - `lib/ai/pricing.ts` — per-model $/1M-tokens table (mergeable via `ai.price_table` setting) + cost estimator
  - `lib/ai/usage.ts` — `AiUsageLog` writer (PHI-scrubbed errors, never throws into the clinical path)
  - `lib/ai/sanitize.ts` — AI-13 injection strip + explicit untrusted-data fence
  - `lib/ai/json.ts` — tolerant JSON extraction + lab-item coercion (AI-07)
  - `lib/ai/health.ts` — `probeProvider`/`probeAllProviders` for CRON-09 (real-key tiny completion; keyless = skipped, never failed)
  - `lib/ai/retry-queue.ts` — `AiRetryQueue` enqueue + `processRetryQueue` worker skeleton for CRON-14 (5 attempts → dead letter)
  - `lib/ai/mock.ts` — full-interface `MockAiClient` (offline/tests) + `parseLabText`; `disclaimer.ts` — `MEDICAL_DISCLAIMER` (AI-14, appended to chat/vision/summary, `_disclaimer` in chatJson)
  - `lib/ai/client.ts` — `getAiClient()` sync mock preserved; new async `getAiClientForDoctor()` (mock in test/`AI_MOCK`, chain otherwise); lab + patient-summary services refactored onto it
  - `lib/db/repositories/ai.repo.ts` — providers/keys/usage/plan-cap/retry-queue SQL; `settings.repo.ts` — `SystemSettings` get/set
  - `prisma/schema.sql` — table 49 `AiRetryQueue`
  - `.env.example` — documented optional `AI_MOCK`
  - `tests/ai-chain.test.ts` — 21 tests (fallback order, auto-disable+cooldown, cooldown skip, degradation+bilingual, vision skip, usage-row accuracy, vault round-trip/tamper/hint, quota warn/stop/bypass, 5 injection samples, pricing)
- **Key Files Map (P11 additions):**
  - `lib/foods/foods.schema.ts` — shared Zod schemas (food create/update/list-query, list create/update, request create/review) + category/tag vocabularies
  - `lib/foods/consistency.ts` — pure quality checks: 4P+4C+9F ±15% gate (FL-09/14), Arabic-aware name normalization, FL-04 dedupe, row-level import validator
  - `lib/foods/excel.ts` — server-only `xlsx` parse (2MB/1000-row caps, PK-magic pre-check) + downloadable template workbook builder
  - `lib/foods/foods.service.ts` + `food-lists.service.ts` + `food-requests.service.ts` — items (scoped CRUD, archive-instead-of-delete), lists (create/copy-as-base), requests (submit/review→global)
  - `lib/foods/index.ts` — public barrel
  - `lib/db/repositories/foods.repo.ts` — `FoodItem` CRUD, `(owner NULL OR owner=?)` visibility, JSON_CONTAINS tag filter, `NutritionPlanMealItem` reference count (FL-17)
  - `lib/db/repositories/food-lists.repo.ts` — `FoodList`/`FoodListItem` CRUD + global/visible listings with item counts
  - `lib/db/repositories/food-requests.repo.ts` — `FoodRequest` queue (pending-first) + single-transition review
  - `app/api/foods/route.ts` + `app/api/foods/[id]/route.ts` — scoped list/create/get/update/delete (404 on foreign, 409 dupe, 422 kcal, archive notice)
  - `app/api/foods/import/route.ts` — multipart `.xlsx` import with per-row report (imported/skipped-dupes/rejected)
  - `app/api/foods/template/route.ts` — sample template download
  - `app/api/food-lists/route.ts` + `[id]/route.ts` + `[id]/copy/route.ts` — list CRUD + FL-13 private-copy (items cloned as own)
  - `app/api/food-requests/route.ts` + `[id]/route.ts` — doctor submit + queue; admin approve (→GLOBAL verified item + doctor notification) / reject with reason
  - `app/[locale]/dashboard/food-lists/page.tsx` + `_components/` (types, food-form-modal, import-panel, request-panel, lists-panel) — doctor UI (search ar/en, category/scope filters, add/edit/delete, import, request, copy-base)
  - `app/[locale]/admin/food-lists/` + `app/[locale]/admin/food-requests/` — interim admin section w/ server role-guard (full shell in P22): global items CRUD + global import + review queue
  - `middleware.ts` — `/api/foods` + `/api/food-requests` added to protected prefixes (`/api/food-lists` already present)
  - `messages/ar.json`, `messages/en.json` — `foodLists` namespace (40 keys)
  - `prisma/schema.sql` — `FoodItem.tags JSON NULL` + table 48 `FoodRequest` (pending/approved/rejected)
  - `package.json` — new dep `xlsx` (Excel import/template)
  - `tests/foods.test.ts` — 16 tests (consistency math, dedupe, ownership, archive rule, import report, request→approve→global, copy-base)
- **Key Files Map (earlier modules):**
- **Key Files Map (P10 additions):**
  - `lib/files/magic.ts` — magic-byte sniffing (jpeg/png/webp/pdf), 10MB img / 20MB pdf limits
  - `lib/files/signed-url.ts` — HMAC-SHA256 15-min download tokens (timing-safe verify)
  - `lib/files/store.ts` — outside-webroot UUID storage (`STORAGE_DIR`), sharp re-encode, chmod notes
  - `lib/files/files.schema.ts` + `files.service.ts` — upload pipeline + signed downloads + patient file listing
  - `lib/db/repositories/files.repo.ts` — `FileAsset` metadata CRUD
  - `lib/db/repositories/visits.repo.ts` — Visit CRUD scoped by doctor
  - `lib/db/repositories/lab-drafts.repo.ts` — LabDraft draft→approved/discarded gate
  - `lib/visits/visits.schema.ts` + `visits.service.ts` — visit CRUD + weight sync + target recalc suggestion
  - `lib/ai/client.ts` — `AiClient` seam + `MockAiClient` + `MEDICAL_DISCLAIMER` (real chain in P12)
  - `lib/labs/lab.schema.ts` + `lab.service.ts` — analyze→draft, drafts/approved lists, review gate
  - `lib/errors/errors.schema.ts` + `errors.service.ts` — client error reports with PHI scrub (OBS-05)
  - `app/api/visits/*`, `app/api/files/*`, `app/api/labs/*`, `app/api/patients/[id]/{summary,documents,labs}`, `app/api/errors/client` — thin handlers
  - `app/[locale]/dashboard/patients/[id]/_components/p10-panels.tsx` — LongitudinalPanel, DocumentsPanel, LabDraftsPanel, AiSummaryPanel
  - `prisma/schema.sql` — added `FileAsset` (46) + `LabDraft` (47) tables
  - `tests/*.test.ts` — 110 passing (20 files; P10 added files-magic, files-signed-url, visits, labs suites)
- **Key Files Map:**
  - `lib/api/response.ts` — unified API response helpers (`ok` now emits `success: true`, QGATE defect fix)
  - `lib/api/request-meta.ts` — (QGATE NEW) `getClientIp`/`getRequestMeta`, shared by 5 routes
  - `lib/db/repositories/audit.repo.ts` + `notifications.repo.ts` — (QGATE NEW) SQL moved out of services, correct `AuditLog`/`Notification` table names
  - `lib/api/validation.ts` — shared Zod schemas & validation helpers
  - `lib/security/session.ts` — JWT cookie issuance/verification (HttpOnly, Secure, SameSite=Strict)
  - `lib/security/rate-limit.ts` — rate limiting (memory + DB fallback)
  - `lib/security/rbac.ts` — permission matrix per PRD §3.2 (6 permissions, 3 roles)
  - `lib/security/audit.ts` — audit logging with IP hashing
  - `lib/auth/auth.service.ts` — full auth flow (register, login, logout, password reset, email verify, revoke all) + `getProfile`; OTP via `crypto.randomInt` (QGATE)
  - `lib/auth/auth.schema.ts` — (QGATE NEW) single-definition auth Zod schemas shared by 6 routes
  - `lib/auth/turnstile.ts` — (QGATE NEW) shared Turnstile verify w/ timeout, used by login/register/forgot
  - `lib/db/pool.ts` — mysql2 pool with prepared statements
  - `lib/db/repositories/users.repo.ts` — User CRUD with parameterized queries
  - `lib/db/repositories/auth.repo.ts` — tokens, codes, audit log
  - `lib/db/repositories/patients.repo.ts` — Patient CRUD + `getStats` + `getWeeklyActivity` (P09)
  - `lib/patients/patients.schema.ts` — (P09, NEW) shared Zod schemas for patients (create/update/list/recalc)
  - `lib/patients/patients.service.ts` — (P09, NEW) business logic (list/create/getWithNutrition/update/remove/recalculate/dashboardStats)
  - `lib/patients/index.ts` — (P09, NEW) public barrel
  - `lib/nutrition/calc.ts` — BMI/BMR(Mifflin-St Jeor)/TDEE/macros/water + safety rails 1200♀/1500♂ + chronic flags
  - `lib/notifications/service.ts` — in-app notifications
  - `lib/email/mailer.ts` — Nodemailer with aliases & rate limit
  - `app/api/auth/*` — 8 route handlers (register, login, logout, me, forgot/reset/verify/change-password, revoke-sessions)
  - `app/api/patients/route.ts` + `app/api/patients/[id]/route.ts` — (P09) thinned to auth→validate→service→respond, shared schemas
  - `app/api/dashboard/stats/route.ts` — (P09, NEW) real dashboard stats + 7-day activity (replaces mocks)
  - `app/[locale]/dashboard/layout.tsx` — (P09) fixed client/server bug, Carbon SideNav/Header shell, notifications unread badge
  - `app/[locale]/dashboard/page.tsx` — (P09) wired to real `/api/dashboard/stats` (stat cards + Recharts weekly chart)
  - `middleware.ts` — JWT verification (jose), CSRF Origin check, role/ownership guards, i18n (+ `/api/dashboard` protected, P09)
  - `next.config.ts` — next-intl plugin, webpack externals for mysql2, security headers
  - `prisma/schema.sql` — 47-table schema per PRD §9 + P10 (UUID PKs) — incl. P09 `Patient.current_weight_kg` fix and P10 `FileAsset` + `LabDraft`
  - `i18n.ts` + `i18n/routing.ts` — next-intl config (ar/en, RTL default)
  - `messages/ar.json`, `messages/en.json` — translations (incl. P10 documents/labs/summary/visit keys)
  - `app/not-found.tsx` + `app/[locale]/not-found/page.tsx` — 404 pages
  - `tests/*.test.ts` — 288 passing (39 files; P27 added newsletter suite with 8 tests)
- **DB Migrations Applied:** Schema ready (prisma/schema.sql, 54 tables + P13 FoodItem mineral columns + P14 plan changes + P17 ExercisePlanExercise.notes + P18 NutritionPlan.show_calories_to_patient + P19 PatientPortalToken + P20 PatientSelfReport/PatientMessage.archived/PatientPortalToken.notify_email + P22 SystemErrorLog.resolution_note + P23 User.password_changed_at + P24 ManualPaymentRequest/PaymobTransaction/Subscription grace+flags + P26 BlogPost.guest_author) — PlanTemplate table (§44) already existed from P04, no new migration for P16 — existing DBs: P09 `current_weight_kg` ALTER → P10 `FileAsset`+`LabDraft` → P11 `FoodItem.tags`+`FoodRequest` → P12 `AiRetryQueue` → P13 4× mineral ALTERs → P14 `ALTER TABLE NutritionPlanMealItem MODIFY food_id VARCHAR(36) NULL` + `ALTER TABLE NutritionPlan ADD COLUMN verification_report JSON NULL` + create `PlanGeneration` → P17 `ALTER TABLE ExercisePlanExercise ADD COLUMN notes TEXT NULL` → P18 `ALTER TABLE NutritionPlan ADD COLUMN show_calories_to_patient BOOLEAN NOT NULL DEFAULT TRUE` → P19 create `PatientPortalToken` (§51) → P20 create `PatientSelfReport` (§52) + `ALTER TABLE PatientMessage ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE` + `ALTER TABLE PatientPortalToken ADD COLUMN notify_email VARCHAR(255) NULL` → P22 `ALTER TABLE SystemErrorLog ADD COLUMN resolution_note TEXT NULL` → P23 `ALTER TABLE User ADD COLUMN password_changed_at TIMESTAMP NULL` → P24 create `ManualPaymentRequest` (§53) + create `PaymobTransaction` (§54) + `ALTER TABLE Subscription MODIFY status ENUM('trial','active','grace','expired','cancelled','pending_payment')` + `ALTER TABLE Subscription ADD COLUMN reminder_7d_sent BOOLEAN NOT NULL DEFAULT FALSE` (+ 3d/0d) → P26 `ALTER TABLE BlogPost ADD COLUMN guest_author VARCHAR(255) NULL` (re-run migrate script)
- **Next Planned Step:** P32 — Pre-launch E2E + staging validation (DB-backed Lighthouse for blog/dashboard, seed script, landing/about/contact pages)
- **Open Issues:**
  - TYPECHECK RED (pre-existing, not introduced in P09/QGATE/P10/P11/P12/P13/P14/P15): errors confined to 3 UI files under `app/[locale]/dashboard/patients/` (`page.tsx`, `new/page.tsx`, `[id]/page.tsx`) + dead-code `ui/composites/Form.tsx`/`Notification.tsx` — wrong Carbon/next-intl API usage. Fixing = UI rewrite, deferred to P09-follow-up/P31. All P11–P15-new/touched files are type-clean (P15: 9 in-pass errors fixed — Button kind, nullable foodId widening, test narrowing).
  - `npm run build` not attempted while typecheck is red (Next build type-checks; same errors would fail it).
  - `STORAGE_DIR` + `FILE_URL_SECRET` are new optional env vars (see README Storage section); existing `.env` files keep working.
  - P11 interim admin pages (`app/[locale]/admin/food-lists`, `food-requests`) duplicate a small item modal instead of importing the doctor one (cross-feature import ban); consolidate when the full admin shell lands in P22.
  - NOTE: a concurrent editor is active in this workspace (files observed changing outside this session's edits in P09/QGATE/P10); all P10 edits re-verified present at pass end. P11 verified no overwrites (food-lists dir was an empty stub; `xlsx` added to package.json).

---

## QUALITY GATE FINDINGS & FIXES

| Severity | Area | File | Finding | Fix Applied |
|----------|------|------|---------|-------------|
| 🔴 Critical | Architecture | `lib/db/repositories/*.ts` | SQL string interpolation in `update` method | Added eslint-disable with justification; all queries use `?` placeholders |
| 🔴 Critical | Architecture | `middleware.ts` | No JWT verification, no CSRF, no role guards | Implemented full middleware with `jose` verification, CSRF Origin check, admin role guard, audit headers |
| 🔴 Critical | Auth | `lib/auth/auth.service.ts` | Skeleton only — no login, logout, OTP, email verify, session revocation | Complete implementation with bcrypt 12, JWT cookies, Turnstile, audit logging, admin notifications |
| 🔴 Critical | Auth | `app/api/auth/*` | No route handlers | Created 8 route handlers with Zod validation, rate limiting, unified error responses |
| 🔴 Critical | Security | `lib/security/jwt.ts` | No `jti`, no token revocation support | Added `jti`, `verifyTokenWithPayload`, integrated with `RevokedToken` table |
| 🔴 Critical | Security | `lib/security/session.ts` (new) | No cookie-based session management | Created HttpOnly+Secure+SameSite=Strict cookie issuance/verification |
| 🔴 Critical | Security | `lib/security/rate-limit.ts` (new) | No rate limiting | Memory + DB fallback with configs for auth, AI, contact, newsletter |
| 🔴 Critical | DB Schema | `prisma/schema.sql` | Only 5/39 tables; wrong PK types (INT vs UUID); missing audit_log columns | Full 45-table schema with UUID PKs, all FKs, indexes, PRD-compliant columns |
| 🔴 Critical | Audit Log | `lib/security/audit.ts` | Wrong table schema (user_id vs actor_id/role/action/entity) | Rewrote to match PRD §6.7 AuditLog table with IP hashing |
| 🟠 High | API Consistency | — | No unified response shape across handlers | Created `lib/api/response.ts` with `ok()`, `fail()`, `failZod()`, `unauthorized()`, etc. |
| 🟠 High | Validation | — | Duplicate Zod schemas across handlers | Created `lib/api/validation.ts` with shared schemas + `parseJsonBody`/`validateQueryParams` |
| 🟠 High | Type Safety | `i18n.ts` | `routing.locales.includes(locale as any)` | Typed locale as `Locale = (typeof routing.locales)[number]` |
| 🟠 High | Type Safety | `lib/api/validation.ts` | Missing `NextResponse` import; `string[]` assign to `string` | Fixed imports and `Record<string, string \| string[]>` |
| 🟠 High | Type Safety | `middleware.ts` | `Request` vs `NextRequest`; role type mismatch | Changed to `NextRequest`, cast role for admin check |
| 🟠 High | Tests | `tests/setup.ts` | Spread of `unknown` from mock | Used `vi.importActual` and explicit return |
| 🟡 Medium | Build | `next.config.ts` | `node:diagnostics_channel` not handled by webpack | Added server externals for `node:diagnostics_channel`, `node:async_hooks` |
| 🟡 Medium | Build | `_not-found` page | next-intl config not found during prerender | Added `createNextIntlPlugin`, root `not-found.tsx` (no i18n), locale-specific `not-found/page.tsx` |
| 🟡 Medium | i18n | `i18n/routing.ts` | Duplicate `i18n/request.ts` | Deleted duplicate; single `i18n.ts` entry point |
| 🟢 Low | Lint | `eslint.config.js` | No ignore for `.next/` | Added `ignores: ['.next/**', 'node_modules/**', ...]` |
| 🟢 Low | Lint | `users.repo.ts` | Dynamic `UPDATE SET` triggers SQL interpolation rule | Added eslint-disable with comment explaining controlled columns |
| 🔴 Critical | API Consistency | `lib/api/response.ts` | `ok()` omitted `success: true`, so every client checking `data.success` treated successes as failures | Added `success: true` to `ok()` + `ApiSuccess` type; locked with `tests/response.test.ts` |
| 🔴 Critical | DB Correctness | `lib/security/audit.ts`, `lib/notifications/service.ts` | Wrote to `audit_log` / `notifications`, but schema tables are `AuditLog` / `Notification` — breaks on case-sensitive MySQL (Linux prod) | Moved SQL into `lib/db/repositories/audit.repo.ts` + `notifications.repo.ts` with correct names; services delegate, API unchanged |
| 🔴 Critical | Auth | `app/api/auth/logout/route.ts` | Passed `payload.jti` where `authService.logout` expects the raw JWT → token never verified → session never revoked | Pass raw token via `getTokenFromRequest`; unauthenticated behavior unchanged |
| 🟠 High | Auth | `lib/auth/auth.service.ts` | OTP via `Math.random` (predictable) | `crypto.randomInt(100000, 1000000)` |
| 🟠 High | Auth | `app/api/auth/forgot-password/route.ts` | Collected `turnstile_token` but never verified it (login/register did) | Verify via shared helper; enforced only when secret configured |
| 🟠 High | Architecture | `app/api/auth/me/route.ts` | Handler imported `users.repo` directly (ROUTE→REPO bypass) | Added `authService.getProfile`, route uses it |
| 🟠 High | Architecture | `lib/security/audit.ts`, `lib/notifications/service.ts`, `lib/security/rate-limit.ts` | Raw SQL inside service/security modules | SQL moved to `audit.repo.ts` / `notifications.repo.ts`; rate-limit SQL noted as P29 debt (table missing, memory fallback works) |
| 🟠 High | Duplication | auth routes ×3 | Turnstile verify block copy-pasted in login/register (+missing in forgot) | Extracted `lib/auth/turnstile.ts` (`verifyTurnstile`, `isTurnstileEnforced`, 8s timeout) |
| 🟠 High | Duplication | auth + patients routes ×5 | `x-forwarded-for` / audit-meta extraction copy-pasted | Extracted `lib/api/request-meta.ts` (`getClientIp`, `getRequestMeta`) |
| 🟠 High | Consistency | auth routes ×6 | Per-file Zod schemas duplicating email/password/OTP fragments | Extracted `lib/auth/auth.schema.ts`, single definitions, routes import |
| 🟡 Medium | Type Safety | `lib/db/pool.ts`, `auth.repo.ts`, `users.repo.ts`, `patients.repo.ts`, `audit.ts`, `mailer.ts` | `any` generics/params/metadata, missing return types | `unknown` defaults, `Record<string, unknown>`, typed arrays, explicit `Promise<…>` |
| 🟡 Medium | Lint | `eslint.config.js` | SQL-guard regex matched `select` inside `nc-select` CSS class (false positive) | Anchored keyword match to `(^|[\s(;])` + uppercase keywords |
| 🟢 Low | Tests | 10 uncovered paths | rate-limit, session, mailer, patients.repo, response shape, turnstile, request-meta, validation helpers untested | 7 new suites, 27 new tests (94/94 green) |

---

## TECH DEBT LEDGER

| Item | Reason | Target Prompt |
|------|--------|---------------|
| Rate limit uses in-memory Map for short windows | DB table `rate_limits` not created yet; will add in P29 (Cron Framework) | P29 |
| Email rate limit is in-memory only | Same as above; SMTP hourly limit enforced in mailer | P29 |
| `process.exit` in `env.ts` (Edge runtime warning) | Fail-fast at boot is required (SEC-01); only runs in Node runtime | Acceptable — not used in Edge |
| mysql2 Edge runtime warnings | mysql2 is Node-only; only used in server components/API routes | Acceptable — architecture compliant |
| No `not-found` translations in `messages/*.json` initially | Added in this pass | — |
| `next-intl` plugin required workaround for `_not-found` | Known Next.js 15 + next-intl issue | — |
| Admin email notification in `auth.service.ts` uses hardcoded fallback | Will be replaced by `SystemSettings` lookup in P22 | P22 |
| `crypto.randomUUID` for `jti` — could use `uuid` v4 package | Native crypto is fine; no dependency needed | — |
| `AUDIT_IP_SALT` default in code | Must be set via env in production; default only for tests | P30 (Security Hardening) |
| 3 dashboard-patient UI files fail typecheck (~85 errs, Carbon/next-intl API misuse) | Pre-existing from earlier sessions; rewrite deferred, P09-new code is type-clean | P09-follow-up / P31 |
| Dead-code `ui/composites/*` (zero importers) + its new type errors | Local Carbon wrappers, nothing imports them; keep for P31 UI adoption rather than delete during active concurrent edits | P31 |
| `lib/security/jwt.ts` duplicates `lib/security/session.ts` (only consumer is `jwt.test.ts`) | Tested and harmless; consolidate in P30 hardening pass | P30 |
| `lib/api/validation.ts` helpers unused (routes hand-roll parsing) | Helpers now covered by tests; adopt incrementally in P10+ routes | P10+ |
| `rate_limits` table missing from schema; `rate-limit.ts` holds SQL outside a repository | Memory fallback works; DB persistence arrives with Cron Framework table | P29 |
| `eslint-disable no-restricted-syntax` comments in `patients.repo.ts` stripped twice by an external concurrent editor | Re-applied and green at pass end; if lint regresses, re-apply (rule itself is intact) | Immediate if recurs |
| Existing dev DBs lack `FoodItem.tags` + `FoodRequest` table | Run `ALTER TABLE FoodItem ADD COLUMN tags JSON NULL` + create `FoodRequest` (see prisma/schema.sql §48) after pulling P11 | Immediate (one-liner + table) |
| Interim P11 admin pages duplicate the doctor item modal | Cross-feature UI import ban; consolidate into shared component when full admin shell lands | P22 |
| AI key read/edit/delete audit_log writes (§6.6) | No key-CRUD routes exist yet in P12 (vault + repo ready); per-call decrypts are covered by AiUsageLog.api_key_id. Add audit calls in the P23 admin key routes | P23 |
| `FoodItem` mineral columns (K/P/Na/sugar) are NULL for all rows | New nullable columns; foods create/import UI does not capture minerals yet — unknown minerals yield review warnings, never blocks. Backfill + UI capture | P14 |
| Saved generation-mode preference (NUT-20/SET-08) | Doctor-level settings store does not exist yet; mode defaults to from_list every wizard run. Persist when settings land | P22 |
| Existing dev DBs lack `Patient.current_weight_kg` | Run `ALTER TABLE Patient ADD COLUMN current_weight_kg DECIMAL(5,2) NULL` after pulling P09 | Immediate (one-liner) |
| Dedicated admin global-template management page | Data-plane ready (PATCH/DELETE + admin gates); full page lands with the P22 admin shell (same precedent as P11 interim admin pages) | P22 |
| QGATE-2 structural splits deferred (behavior-preservation): plans.repo 343 / foods.repo 335 / editor.service 307 / generation.service 254 / auth.service 227 / ai.chain 202 lines; functions >40 lines (bulkEdit ~190, nutrition save ~150); DB-row `as` casts instead of Zod row validation; `any` + Carbon misuse confined to 3 patients UI files + 2 dead ui/composites | Splitting intricate tested services/repos risks subtle behavior change; files are cohesive single-responsibility modules with full test cover. Split incrementally with P31 UI/performance pass, or per-feature when touched next | P31 / incremental |
| P20 chart-canvas overlay for self-reported weights | Data plumbed (table + repo + trend merge + additive API field); overlay must land in the pre-existing typecheck-broken P10 longitudinal panel — belongs with its P31 rewrite, not a drive-by | P31 |
| CMS-controlled newsletter landing section (NL-01) | No landing renderer exists in the codebase (P22 CMS manages data only); shared SubscribeForm mounted on blog surfaces + pricing footer; wire into landing renderer when built | P28+ |

---

## CHANGELOG
- **P01–P05**: Foundation (stack, Carbon T0, i18n, DB/Repo, Email)
- **P06–P07**: Auth & Security Hardening (this pass) — complete auth flow, JWT cookies, middleware, RBAC, audit, rate limiting
- **P08**: Public Site — llms.txt, build fixed, not-found pages, 16 routes generated
- **P09**: Doctor Dashboard & Patients Core — service layer (`lib/patients/`), thin patient APIs, real `/api/dashboard/stats`, dashboard shell+home wired, `current_weight_kg` schema fix, 4 new service tests (67/67 green); snapshot verification found prior gate claims overstated (see Quality Gate findings)
- **Prior gate claims (P08 snapshot) vs verification 2026-09-20**: lint claimed "1 warning" — actual was 5 errors + 3 warnings (fixed to 0 errors + 3 warnings in P09); typecheck claimed "0 errors" — actual ~90 errors in 3 dashboard-patient UI files (pre-existing, still open); tests claimed "39/39" — actual suite is 67 tests incl. nutrition (all pass); build "success" claim not reproducible while typecheck is red.
- **QGATE (quality-gate pass)**: 5 defects fixed (ok() envelope, AuditLog/Notification table names, logout revocation, Math.random OTP, forgot-password Turnstile) + layering/duplication/type-safety hardening + 27 new tests (94/94 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 94/94.
- **P10**: Visits CRUD + longitudinal charts + secure upload infra (magic bytes, sharp re-encode, UUID storage, HMAC downloads) + patient documents + lab analyzer with approval gate + anonymized AI summary + client error reporting; 16 new tests (110/110 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 110/110.
- **P11**: Food lists — global (admin) + private (doctor) items with `(owner NULL OR owner=?)` visibility, ±15% kcal gate on save/import/request, Arabic-aware dedupe, Excel import with per-row report + template download, FoodList grouping + copy-public-as-base (items cloned as own), doctor request queue → admin approve (creates verified GLOBAL item + notifies doctor) / reject with reason, archive-instead-of-delete for plan-referenced items; doctor UI + interim admin section (role-guarded, full shell in P22); `FoodRequest` table (48) + `FoodItem.tags`; new dep `xlsx`; 16 new tests (126/126 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 126/126.
- **P12**: AI provider layer — 4 adapters (OpenAI/Gemini/Anthropic/Custom) with timeouts + backoff + auto-continuation, AES-256-GCM vault (ciphertext-only, key_hint), priority fallback chain with failure-count auto-disable (5 fails → 15-min cooldown), per-doctor monthly quota (plan-first, 80% warn, 100% bilingual soft-stop, admin bypass), usage logging with PHI scrub + cost estimation, injection sanitizer + data fence, disclaimer on every output, degradation → `AiRetryQueue` (49) for CRON-14, health probes for CRON-09, mock preserved for tests; lab + summary refactored onto `getAiClientForDoctor()`; 21 new tests (147/147 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 147/147.
- **P13**: Deterministic reconciler + medical guards (pure TS, no AI) — greedy local-search reconciler on §8.3 objective (kcal-first best tracking, 5g→1g, 5g rounding held to ±3, ≤5 accept else needs_retry), absolute 1200/1500 rails, synonym allergy guard (strip pre-draft + save hard-block), contraindication caps incl. kidney no-auto-suggest, pairing matrix (1 HARD + 3 toggleable warnings, model claim ignored), NUT-05 ordered pipeline with first-fail-wins, NUT-06 incident archiver + JSONL regression file, FoodItem mineral columns; QA-02 500/500 property cases green + kidney 2.0g/kg block + حليب→زبادي block; 20 new tests (167/167 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 167/167.
- **P14**: Two-mode plan generation — from_list (admin-first candidates, own-only-on-toggle, NP-21 scope regen) + ai_free (§8.7.3: confirm gate, NUT-21 drop, name allergy guard + caveat, auto-match + ✓, ratio/report/ratio fields, mineral notice, >30% publish warning, one-click convert-to-verified + re-reconcile); full P13 pipeline per attempt (≤3, provider rotation via P12 chain); drafts ALWAYS pending_doctor_approval; params/attempts/wall-time persisted (`PlanGeneration`); 7-step wizard UI with report + unverified styling; 7 new tests (174/174 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 174/174.
- **P15**: Interactive plan editor — live totals (shared preview math, server authoritative on save), swap/add/remove + HTML5 DnD, bulk scope meal/day/week/all-weeks with exclusion preview + global-swap-by-foodKey, >±2% alert + auto-reconcile, one-step undo via pre-apply revisions, append-only revisions with diffs + restore-as-newest, approve gate (≤5 + all-day guard re-verify + floor reject + stamps + audit), week tabs/clone/archive, adaptive recompute from visit weight; portal push deferred to P19; 10 new tests (184/184 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 184/184.
- **P16**: Template library + adaptive plans — save-as-template (copy-on-save snapshot + reference macros), proportional rescale + P13 reconciler per day, allergy strip + contraindication report on apply, >20% confirm gate, adaptive suggest from last-visit weight as NEW pending draft (never auto-publishes), global templates admin-gated (create/edit/archive), library UI (category groups, search, usage sort) + apply modal + adaptive panel, `templates` i18n namespace (ar/en); PlanTemplate table pre-existed (§44), no migration; 5 new tests (189/189 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 189/189.
- **P17**: Exercise plans — AI wizard (goal/level/equipment → chatJson, server-clamped volumes, pending draft + medical disclaimer), editor (day tabs, HTML5 DnD reorder, inline sets/reps/rest/youtube/notes), YouTube URL store + read-time video-ID/thumbnail derivation (portal embed in P19), bulk day/week/all-weeks (preview + exclusions + pre/post-revision undo), copy-day incl. cross-week, approve gate (pending→active, non-empty, archived blocked), revisions (plan_type='exercise', pre-restore backup), adaptive copy-as-new-pending-draft from last-visit weight; `notes` column migration; 10 new tests (199/199 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 199/199.
- **P18**: Print + white-label — SSR A4 routes (dedicated print.css, no Carbon classes, page-break/compact tables, 5g grams, optional calories via Q2 flag default true), cookie-or-24h-share-key auth (generic 404), clinic logo (P10 secure upload, `file:` refs → fresh signed URLs, platform fallback) + clinic name in header, RTL/LTR via ?locale=, browser-print-to-PDF hint (no Puppeteer), branding settings UI + APIs; 8 new tests (207/207 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 207/207.
- **QGATE-2**: Full-repo audit + fixes — layering verified (zero SQL in handlers/services after errors.repo extraction; zero reverse imports; no cycles), `fail()` ×6 → one factory, `readApi` ×17 → one module, bulk.service 394→243 (week ops split, verbatim move), cross-feature imports via barrels, stale P17 shadow route deleted, dead `exerciseFail` export + 2 unused imports removed, validation helpers unified on fail()/failZod(); 10 new tests (217/217 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 217/217.
- **P19**: Token-only patient portal — UUID tokens (7/30/60/90-day, per-token permissions, revoke, access counters), single generic invalid/expired error, mobile-first home + read-only plan views (P18 calorie flag, 5g grams, inline YT embeds), weight/note/message submissions as thread rows (no auto weight mutation, doctor notified), no accounts, per-token rate limits, /p 301 alias, doctor generator modal; 7 new tests (224/224 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 224/224.
- **P20**: Async messaging + inbox — thread model with type renderers (weight/measurement/image/note), doctor inbox (badges, 60s poll, reply + reply-email, read, archive, 5-min sender delete audited), portal thread + token image upload + own-delete, self-report records merged into trends (canvas overlay → P31), `messages` middleware protection; 9 new tests (233/233 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 233/233.
- **P21**: AI assistant + patient context + labs — conversations (title/pin/archive/search/trash-30d/export), de-identified server context (metrics, trend, plans, allergies, labs, files) with consent gate + inline capture, change-patient confirm warning, what-was-sent transparency + retention flags, per-message vision attachments, disclaimer on every reply (chain + banner), lab-analyze → drafts (P10 logic, audited); zero DB migrations (tables pre-existed); 6 new tests (239/239 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 239/239.
- **P22**: Admin panel core — shell with badges, overview (MRR, by-plan, AI-cost placeholder), users + subscription adjust with reason, pending queue (bulk, reject-with-reason, >24h highlight), super-only pricing CRUD (404 otherwise), CMS landing/pages, sensitive-gated settings + test email + aliases, bulk email with tracking + retry, error center with notes, contacts + public intake (P08 gap); 6 new tests (245/245 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 245/245.
- **P23**: AI gateway + security + audit + cost — provider cards (DnD reorder persisted to live chain, enable, custom URL, ping), keys (encrypted, hint-only, rotate, per-key stats), Turnstile + password-policy security page (policy enforced in register/reset/change/login-expiry, Turnstile settings-first with env fallback), super-only audit viewer, cost dashboard (USD/EGP, trend chart, top consumers, CSV export audited), usage explorer; 6 new tests (251/251 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 251/251.
- **P24**: Billing + Paymob — Intention checkout (settings-driven, no auto-retry) + manual path with admin queue (approve/reject/trial-grant, all audited), HMAC webhook (403, idempotent, auto-activate + welcome + admin alert), 3-day grace with doctor banner → expired lock + admin page on deactivation, cron bodies (expire/reminders/reconcile) ready for P29, white-label receipt (Q4 tax note), pricing page; 8 new tests (259/259 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 259/259.
- **P25**: Blog public + SEO — tagged-cache ISR without rebuilds, bilingual rules (ar source, /en hides untranslated, hreflang both-only + x-default ar, self canonical), per-post SEO (meta caps, OG, noindex, JSON-LD, sitemap + llms.txt auto-index), save-time HTML re-sanitized on render, TOC + related + reading-time + views, markdown negotiation for agents, comments disabled by omission; 12 new tests (271/271 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 271/271.
- **P26**: Blog admin + media — lazy TipTap (full toolbar, BubbleMenu, shortcuts, paste cleaner, drag-drop upload, per-block dir), md-canonical round-trips, lifecycle (schedule + CRON-10 hook, signed preview, 20 revisions + restore), SEO/SERP panels, taxonomy CRUD, EN-clone linking (no MT), newsletter lock, WebP media library (alt-gated, guarded delete); sharp/tiptap/markdown/turndown deps added (also fixes latent P10 sharp gap); 9 new tests (280/280 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 280/280.
- **P27**: Newsletter consent core — double opt-in (48h single-use), neutral duplicate/suppression responses, honeypot + Turnstile + 5/h/IP, one-click unsubscribe, permanent suppression enforced at every send, CSV import (pending-only) + audited export, hard delete (erasure), admin subscribers section; 8 new tests (288/288 green); gates: lint 0 errors, typecheck red only in pre-existing UI files, tests 288/288.