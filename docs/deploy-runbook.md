# Deploy Runbook — app.nutricliniceg.com on cPanel (P32)

> Repo: `app.nutricliniceg.com` (GitHub). Production URL: `https://app.nutricliniceg.com`.
> Golden rule (UI-19): **the server never builds.** `next build` runs in GitHub
> Actions; the server only unpacks the artifact and flips a symlink.

## 0. GitHub Secrets (you create these — never commit them)

| Secret | Value |
|---|---|
| `CPANEL_SSH_HOST` | SSH hostname from cPanel (often the server hostname, not the domain) |
| `CPANEL_SSH_USER` | cPanel username |
| `CPANEL_SSH_KEY` | Private key whose **public** half is in cPanel → SSH Access → Manage Keys → Authorize |
| `CPANEL_SSH_PORT` | Usually `22` (set only if your host uses another port) |
| `CPANEL_APP_DIR_PROD` | e.g. `/home/<user>/apps/nutri-prod` (NEW dir — see §1) |
| `CPANEL_APP_DIR_STAGE` | e.g. `/home/<user>/apps/nutri-stage` (NEW dir — see §1) |
| `STAGING_HOST` | Staging subdomain, e.g. `staging.nutricliniceg.com` (no scheme) |

## 1. One-time cPanel setup (new app, touches nothing existing)

1. **Subdomain**: create `app.nutricliniceg.com` → document root can stay default;
   the Node app is served by Passenger from the app dir, not the document root.
   (Optional staging: `staging.nutricliniceg.com` the same way.)
2. **Node app**: cPanel → Setup Node.js App → **Create Application** (do NOT edit
   any existing app):
   - Node version: **20** (matches CI `NODE_VERSION`)
   - Application root: `/home/<user>/apps/nutri-prod/current` (symlink target;
     create `apps/nutri-prod/releases` manually first)
   - Application startup file: `server.js` (standalone output provides it)
   - For staging: second app rooted at `apps/nutri-stage/current`.
3. **Databases**: MySQL Databases → create `nutriapp_prod`, `nutriapp_stage`,
   `nutriapp_verify` (cPanel adds your account prefix automatically), or paste
   `scripts/db-create.sql` in phpMyAdmin. Load schema:
   `mysql -u <user> -p <db> < prisma/schema.sql` per DB, then the ALTERs listed
   in `PROGRESS.md` → "DB Migrations Applied" if needed.
4. **Env vars** (cPanel Node App UI — never in git): every key from
   `.env.example` with production values: `NODE_ENV=production`,
   `APP_URL=https://app.nutricliniceg.com`, `JWT_SECRET` (≥32 chars),
   `ENCRYPTION_KEY` (≥32), `DATABASE_*` (point at `nutriapp_prod`),
   `SMTP_*`, `CRON_SECRET` (≥16), `STORAGE_DIR` (e.g.
   `/home/<user>/storage/uploads`, mode 700), `FILE_URL_SECRET` (≥16),
   `BACKUP_DIR`, `BACKUP_SCRATCH_DB=nutriapp_verify`. Staging app uses the
   `_stage` DB + test Paymob/AI keys (R17).
5. **SSL**: AutoSSL/Let's Encrypt on `app.nutricliniceg.com` (+ staging) —
   HSTS is already emitted by `next.config.ts` in production.
6. **Cron lines** (cPanel → Cron Jobs, from `docs/cron-operations.md`):
   call `GET /api/cron/<task>` with header `x-cron-secret: $CRON_SECRET`
   (curl with `--header`), never the secret in the URL.
7. **Alternative path — `.cpanel.yml`**: if your host offers "Git Version
   Control → Deploy via `.cpanel.yml`", keep it as emergency manual path only.
   It must still deploy a **prebuilt** artifact (push `release.tgz` built by CI),
   never run `npm run build` on the server.

## 2. Release flow

1. Merge to `main` → CI gate must be green (lint + typecheck + tests +
   gitleaks + build + bundle/CSS gates).
2. Tag `git tag v1.0.0 && git push origin v1.0.0` (or Actions → Deploy →
   Run workflow → `staging` first, verify, then `production`).
3. Watch the workflow: package → upload → symlink switch (last 2 releases
   kept) → Passenger restart → smoke test (`scripts/smoke-staging.cjs`).
4. If health fails, the workflow rolls back to the previous release and exits
   1 — fix forward, never hot-patch on the server.

## 3. First-deploy checklist

- [ ] CI green on `main`
- [ ] Secrets (§0) set; SSH key authorized in cPanel
- [ ] New Node app(s) created (§1.2), never edited existing ones
- [ ] DBs created + schema loaded; app connects (`/api/health` → `db.ok`)
- [ ] Env vars set in cPanel UI; `APP_URL` matches the domain
- [ ] SSL active; `https://app.nutricliniceg.com/api/health` reachable
- [ ] Cron lines installed with secret header
- [ ] Staging smoke (`node scripts/smoke-staging.cjs https://<staging>`) → SMOKE OK
- [ ] Production smoke → SMOKE OK

## 4. Rollback (rehearsed)

```sh
APP_DIR=/home/<user>/apps/nutri-prod
PREV=$(ls -1t "$APP_DIR/releases" | sed -n '2p')
ln -sfn "$APP_DIR/releases/$PREV" "$APP_DIR/current"
touch "$APP_DIR/current/tmp/restart.txt"
```

Verify with the smoke script afterwards. Deploys keep 2 releases (R7).

## 5. Backup / restore quick reference

Nightly encrypted dumps via CRON-07 (`lib/backup/backup.service.ts`,
`BACKUP_DIR`); weekly scratch-restore verification into `nutriapp_verify`
(CRON-15 `backup-verify`). Full procedure: `docs/cron-operations.md`.
