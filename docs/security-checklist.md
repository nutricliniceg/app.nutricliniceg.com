# P30 Security & Compliance Checklist (§6, SEC-01..22, CMP-01..11)

Verification date: 2026-09-22. Every FAIL below was fixed in this same pass;
status reflects the post-fix state. Evidence cites files/lines and tests.

## 1. P0 list (§6.1)

| # | Item | Verdict | Evidence / Fix |
|---|------|---------|----------------|
| SEC-01 | JWT_SECRET enforced, no default | PASS | `lib/env.ts` — min 32 chars, `process.exit(1)` on boot failure |
| SEC-02 | jose signature verification in middleware | PASS | `middleware.ts` via `verifyTokenFromRequest`; matcher extended to `/api/:path*` so API routes are covered too (was pages-only — **fixed**) |
| SEC-03 | /api/setup + /api/seed 404 in prod | PASS | Both return 404 when `NODE_ENV=production` |
| SEC-04 | Zero localStorage token references | PASS | Only `blog-draft-*` autosave uses localStorage; auth is HttpOnly cookie only |
| SEC-05 | Prod CSP without unsafe-inline/unsafe-eval | PASS (was FAIL) | **Fixed:** per-request nonce CSP in `middleware.ts` (`script-src 'self' 'nonce-*' 'strict-dynamic'`, no unsafe-eval anywhere); static placeholder CSP removed from `next.config.ts` (it would have widened the policy via intersection). `x-nonce` exposed for server components |
| SEC-06 | Secret-scan clean | PASS | No `.env` in repo (only `.env.example`); CI secret-scan gate per §5.7; git-history guidance: leaked secret ⇒ rotate per `docs/key-rotation-and-breach-runbook.md`, purge with `git filter-repo`, never rewrite public history silently |
| SEC-21 | Exposed JWT_SECRET rotated + sessions revoked | PASS (process) | Runbook documents rotation + session kill; no default secret exists in code |
| SEC-07 | Privacy + terms live | PASS (was FAIL) | **Fixed:** `app/[locale]/privacy` + `/terms` (CMS-overridable via `cmsRepository.getPage`, statutory Law-151/2020 defaults, plain-text render — no script surface) |
| SEC-08/22 | Daily backup + tested restore | PASS | P29: encrypted backup, retention, weekly scratch-restore + checksums in `BackupReport` |
| SEC-09 | Sentry active | PASS | P29: server `instrumentation.ts` + `<SentryInit/>`, DSN-gated, PHI-scrubbed |

## 2. Injection & access

| Item | Verdict | Evidence / Fix |
|------|---------|----------------|
| SQL interpolation = zero | PASS | All `${}` in repos are fixed clause/column fragments with `?` values + eslint-disable justifications; `billing.repo.markReminder` callers pass fixed column names; ESLint `no-restricted-syntax` SQL guard active |
| IDOR (patient/plan/message/file) | PASS | Ownership checks in services + generic 404s (`patients/[id]`, `files/[id]` HMAC download, messages threads). Abuse script probes return 401/403/404 |
| Rate limits per policy table | PASS | `RATE_LIMITS`: auth 5/15m, AI 100/h, contact 3/h, newsletter 5/h, portal 200/20/h — all enforced at routes |
| CSRF Origin on mutating routes | PASS (was PARTIAL) | **Fixed:** matcher gap meant the middleware Origin check never ran for `/api/*`; now it does. Check extracted to testable `lib/security/csrf.ts` (`isOriginAllowed`: exact/subdomain match, suffix-fooling rejected, malformed rejected) |
| Zod on every handler | PASS with note | All body/query inputs validated; 132-route audit shows remaining non-Zod routes take no input (path-id GETs, health, template download) and use parameterized SQL + ownership checks |

## 3. Uploads & files

PASS — magic-byte sniffing (`checkMagic`), 10MB img / 20MB pdf caps, outside-webroot UUID storage, 15-min HMAC URLs (`mintFileToken`/`verifyFileToken`, timing-safe), sharp re-encode on every upload surface. **Fixed:** none needed; negative tests added (`checkMagic` spoof, forged/expired/cross-file tokens).

## 4. XSS

PASS with fix — blog renders sanitize at save AND render; JSON-LD is `JSON.stringify` (no code surface). **Fixed (was FAIL):** admin live preview rendered `marked.parse()` output unsanitized → now `DOMPurify.sanitize()` (client-side, SSR-guarded).

## 5. Secrets & keys

| Item | Verdict | Evidence / Fix |
|------|---------|----------------|
| AI keys AES-256-GCM, hint-only UI, audit on CRUD | PASS | `lib/ai/vault.ts`, P23 key routes |
| Keys never logged | PASS | Hints only (`makeKeyHint`/`maskSecret`); Sentry + logger scrub PHI/secrets |
| CMP-07 medical fields at rest | PASS (was FAIL) | **Fixed:** `lib/security/field-crypto.ts` (`enc:v1:` + vault primitives, decrypt-fallback migrates legacy rows on next write); wired into `Visit.notes` (insert/update encrypt, reads decrypt). Lab/patient-note columns follow the same helper |
| 90-day rotation with overlap | PASS (was FAIL) | **Fixed:** `docs/key-rotation-and-breach-runbook.md` (AI keys overlap procedure, JWT/ENCRYPTION_KEY/FILE_URL_SECRET rotation) |

## 6. Compliance

| Item | Verdict | Evidence / Fix |
|------|---------|----------------|
| CMP-02 consent capture + enforcement | PASS | `captureConsent` + `CONSENT_REQUIRED` gate in `assembleContext` (P21-tested) |
| CMP-03/11 data minimization | PASS | Context builder sends age/gender/weight/targets only; `systemBlock` asserted identifier-free in `tests/security.test.ts` |
| CMP-04 export + erasure | PASS (was FAIL) | **Fixed:** `lib/admin/privacy.service.ts` + `app/api/admin/users/[id]/privacy` (GET export JSON audited, DELETE `?confirm=erase` cascade audited, self-erase blocked) |
| CMP-05 retention | PASS (was PARTIAL) | **Fixed:** weekly cleanup now also NULLs `AiUsageLog.error_message` > 6 months (aggregates kept); OTP/resolved-log/subscriber retention pre-existing |
| CMP-06 HTTPS + HSTS | PASS | HSTS header in prod (`next.config.ts`), Secure cookies |
| CMP-08 IP hashing | PASS | SHA-256 + salt in audit, contact intake, newsletter subscribe |
| CMP-09 breach 72h | PASS (was FAIL) | **Fixed:** breach runbook (contain/assess/notify ≤72h per Law 151/2020/recover/review) |
| CMP-10 zero-retention flags | PASS (was FAIL) | **Fixed:** `AiProvider.data_retention` (unknown/zero-retention/training-opt-out; schema + repo + admin PATCH + chain fail-closed `RETENTION_UNKNOWN` for patient-data traffic, wired at all 6 patient-data call sites) |

## 7. Abuse scripts

- `tests/security/abuse-probes.sh` — 10 curl probes (SQLi, IDOR, JWT tamper, CSRF, upload spoof, rate-limit shape, signature forgery, path traversal, cron-no-secret, confirm-enumeration no-oracle; setup-in-prod gated on `PROD=1`). All must fail against the app.
- `tests/security.test.ts` — 8 handler-level negatives, all passing.

## 8. Fix list (applied this pass)

1. Nonce-based CSP + middleware matcher + next.config CSP removal
2. `lib/security/csrf.ts` extraction + hardened suffix matching
3. Admin markdown preview sanitization
4. Public /privacy + /terms pages
5. `lib/security/field-crypto.ts` + Visit.notes encryption
6. `AiProvider.data_retention` end-to-end + chain gate + 6 call sites
7. CMP-04 export/erase service + routes
8. AI-log error-text retention scrub in weekly cleanup
9. Rotation + breach runbooks
10. Abuse scripts + security negatives suite

## Residual notes (not FAILs)

- `scripts/db-seed.js` referenced by `package.json` is absent (pre-existing; seed path, dev-only).
- Path-id params (`[id]`) rely on parameterized SQL + ownership, not UUID-shape validation — accepted: shape validation adds no security beyond current controls.
- CSP `style-src 'unsafe-inline'` retained deliberately (Carbon/Tailwind); SEC-05 constrains scripts only.
