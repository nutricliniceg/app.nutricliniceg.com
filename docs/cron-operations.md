# Cron operations, observability & backups (P29)

## cPanel cron lines

Set `CRON_SECRET` in the Node app environment, then add one line per task
(cPanel → Cron Jobs). `$CRON_SECRET` below is a shell variable — export it
once at the top of the crontab, or inline the secret per line.

```cron
CRON_SECRET=<same-value-as-app-env>
APP_URL=https://nutricliniceg.com

0 2 * * *   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/expire-subscriptions" >> ~/cron.log 2>&1
0 9 * * *   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/reminders-7d" >> ~/cron.log 2>&1
0 9 * * *   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/reminders-3d" >> ~/cron.log 2>&1
0 9 * * *   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/reminders-0d" >> ~/cron.log 2>&1
0 8 * * *   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/doctor-digest" >> ~/cron.log 2>&1
0 3 * * *   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/backup" >> ~/cron.log 2>&1
0 4 * * 0   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/cleanup" >> ~/cron.log 2>&1
0 */6 * * * curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/ai-health" >> ~/cron.log 2>&1
*/15 * * * * curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/publish-posts" >> ~/cron.log 2>&1
*/5 * * * * curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/newsletter-send" >> ~/cron.log 2>&1
0 4 * * *   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/newsletter-cleanup" >> ~/cron.log 2>&1
0 5 * * *   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/reconcile-payments" >> ~/cron.log 2>&1
*/10 * * * * curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/ai-retry" >> ~/cron.log 2>&1
0 */12 * * * curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/activation-reminders" >> ~/cron.log 2>&1
0 6 * * 0   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/cron/backup-verify" >> ~/cron.log 2>&1
```

Wrong/missing secret → `404` (no task enumeration). GET → `404`.

## Idempotency

Every task re-run is a no-op: reminder sent-flags, `uq(campaign,subscriber)`
send keys, retry-queue `claimDue`, `newsletter_sent_at` lock, subscription
state machine. Verified by `tests/cron.test.ts`.

## Backups (RPO 24h / RTO 4h)

- Daily 03:00 encrypted (`AES-256-GCM`, `ENCRYPTION_KEY`) mysqldump.
- Retention: newest 7 + 4 weeklies + 3 monthlies; off-server PUT when
  `S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY` are set, else
  `BACKUP_DIR` (default `../secure-backups`, mode 0700).
- Weekly verification restores into `BACKUP_SCRATCH_DB`
  (default `<DATABASE_NAME>_verify`) + row-count checksums; reports land in
  `BackupReport` and the admin health page.

## Quarterly manual restore drill (PF-09/10)

1. Pick the latest `verified` row in `BackupReport`.
2. Decrypt + restore into a fresh scratch DB on staging.
3. Spot-check 5 patients, 5 plans, login as a test doctor.
4. Record result (date, operator, outcome) in the ops log.
5. Target: restore completes in < 4h (RTO), data loss < 24h (RPO).

## Observability

- Sentry (server via `instrumentation.ts`, client via `<SentryInit/>`) only
  when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` is set; every event scrubbed
  of PHI before send (`lib/observability/sentry.ts`).
- Structured JSON logs with `x-request-id` (middleware sets + echoes it).
- `GET /api/health` → `{ db, smtp, ai, cron }` statuses, no secrets.
- Admin → Health dashboard shows components + alerts (OBS-04 thresholds).
