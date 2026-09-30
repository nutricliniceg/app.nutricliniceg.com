# Key rotation runbook (§6.6)

## AI provider keys — every 90 days, with overlap

1. In Admin → AI Providers, open the provider and click **Add key**; paste
   the new key from the provider console. Both keys stay `is_active` — the
   chain tries keys in order, so traffic migrates without downtime.
2. Watch Admin → AI Usage for 24h: new-key usage > 0, error rate normal.
3. **Rotate** the old key (marks `last_rotated_at`, keeps it valid for
   in-flight retries), wait 24h, then **delete** it.
4. Every add / rotate / delete is written to `AuditLog` automatically
   (do NOT skip the reason note in the confirm dialog).

## JWT_SECRET rotation (SEC-21)

1. Generate: `openssl rand -base64 48`.
2. Set the new value in cPanel env + CI secrets simultaneously.
3. Restart the Node app. All sessions invalidate at once (by design —
   announce a maintenance window; users simply log in again).
4. Verify: `curl -s https://nutricliniceg.com/api/health` → 200, then log in.

## ENCRYPTION_KEY rotation

`ENCRYPTION_KEY` decrypts AI keys and CMP-07 medical fields — rotation
requires re-encryption:

1. Put the app in maintenance mode (cPanel: stop app).
2. Take a verified backup (`POST /api/cron/backup`, then `backup-verify`).
3. Run the re-encrypt script against `AiApiKey.key_encrypted` and
   `enc:v1:`-prefixed medical fields with old+new keys.
4. Swap the env value, restart, verify decrypt via Admin → AI Providers.
5. Keep the old key in the password manager for 30 days, then destroy.

## FILE_URL_SECRET rotation

Swap at any quiet hour: only in-flight 15-min download links break
(recipients re-request them). No data migration needed.

# Breach runbook (CMP-09 — 72h)

1. **Contain (0–4h):** revoke suspected credentials (rotate `JWT_SECRET` to
   kill all sessions), block attacker IPs at Cloudflare/cPanel, snapshot
   logs (`AuditLog`, `SystemErrorLog`, web access logs) to offline storage.
2. **Assess (4–24h):** which tables/rows were exposed? Patient health data
   involved? Preserve evidence; do NOT delete attacker artifacts yet.
3. **Notify (≤72h):** inform affected doctors + the Egyptian Personal Data
   Protection Center per Law 151/2020; document what, who, when, mitigations.
4. **Recover:** force password resets (`revoke-sessions`), rotate all keys
   per this runbook, patch the entry vector, add a regression test.
5. **Review:** post-mortem in the ops log within 7 days.
