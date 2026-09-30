#!/usr/bin/env bash
# P30 abuse probes — top-10 attacks as curl repros.
# Every probe MUST fail against the app (4xx, or a 200 with a generic
# no-oracle body): a 200 WITH data means the control is broken.
# Run: APP_URL=https://... bash tests/security/abuse-probes.sh
# The /api/setup probe only applies in production: PROD=1 bash ... otherwise skipped.
set -u
APP_URL="${APP_URL:-http://localhost:3000}"
pass=0; fail=0; skip=0
check() { # $1=name $2=want(s, comma-separated) $3=url [curl args...]
  local name="$1" want="$2"; shift 2
  local code; code=$(curl -sS -o /dev/null -w "%{http_code}" "$@" 2>/dev/null || echo "000")
  local ok=0
  IFS=','; for w in $want; do [ "$code" = "$w" ] && ok=1; done; unset IFS
  if [ "$ok" = 1 ]; then echo "PASS $name ($code)"; pass=$((pass+1)); else echo "FAIL $name (got $code, want $want)"; fail=$((fail+1)); fi
}
check_body_absent() { # $1=name $2=forbidden-string $3=url
  local name="$1" forbidden="$2" url="$3"
  local body; body=$(curl -sS "$url" 2>/dev/null || echo "")
  case "$body" in *"$forbidden"*) echo "FAIL $name (oracle leaked)"; fail=$((fail+1));; *) echo "PASS $name (no oracle)"; pass=$((pass+1));; esac
}
echo "== P30 abuse probes vs $APP_URL =="
check "SQLi-in-login" 400 "$APP_URL/api/auth/login" -X POST -H 'Content-Type: application/json' -d '{"email":"x@x.com'"'"' OR 1=1--","password":"x"}'
check "IDOR-patient-noauth" 401 "$APP_URL/api/patients/some-id"
check "JWT-tamper" 401 "$APP_URL/api/patients" -H 'Cookie: token=eyJhbGciOiJIUzI1NiJ9.tampered.signature'
check "CSRF-cross-origin-noauth" 401 "$APP_URL/api/patients" -X POST -H 'Cookie: token=fake' -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}'
check "upload-spoof-noauth" 401 "$APP_URL/api/files" -X POST -F "file=@/etc/hosts;type=image/jpeg"
check "ratelimit-shape" 400 "$APP_URL/api/auth/login" -X POST -H 'Content-Type: application/json' -d '{}'
check "signature-forgery-file" 403 "$APP_URL/api/files/some-id?token=forged"
check "path-traversal-file" 403,404 "$APP_URL/api/files/..%2F..%2Fetc%2Fpasswd?token=forged"
check "cron-no-secret" 404 "$APP_URL/api/cron/backup" -X POST
check_body_absent "enumeration-confirm-no-oracle" "تم تأكيد الاشتراك" "$APP_URL/newsletter/confirm/does-not-exist"
if [ "${PROD:-0}" = 1 ]; then check "setup-in-prod" 404 "$APP_URL/api/setup"; else echo "SKIP setup-in-prod (set PROD=1 against production)"; skip=$((skip+1)); fi
echo "== $pass passed, $fail failed, $skip skipped =="
[ "$fail" -eq 0 ]
