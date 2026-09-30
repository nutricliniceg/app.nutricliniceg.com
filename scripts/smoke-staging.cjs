// Post-deploy smoke test for staging/production (P32).
// Usage: node scripts/smoke-staging.cjs https://app.nutricliniceg.com
// Exits 0 when all probes pass, 1 otherwise. No secrets required.
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

async function probe(name, path, expectStatus) {
  const res = await fetch(base + path, { redirect: 'manual' });
  const ok = expectStatus.includes(res.status);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: GET ${path} -> ${res.status} (want ${expectStatus.join('/')})`);
  return ok;
}

async function healthBody() {
  const res = await fetch(base + '/api/health');
  if (res.status !== 200) {
    console.log(`FAIL health: status ${res.status}`);
    return false;
  }
  const json = await res.json();
  const ok = json?.success === true && (json?.data?.status === 'ok' || json?.data?.status === 'degraded');
  console.log(`${ok ? 'PASS' : 'FAIL'} health: status=${json?.data?.status} db=${JSON.stringify(json?.data?.components?.db)}`);
  return ok;
}

(async () => {
  const results = await Promise.all([
    healthBody(),
    probe('public-ar', '/ar', [200]),
    probe('public-en', '/en', [200]),
    probe('login-page', '/ar/login', [200, 308, 307]),
    probe('portal-guard', '/api/portal/does-not-exist', [400, 404]),
  ]);
  if (results.every(Boolean)) {
    console.log('SMOKE OK');
  } else {
    console.log('SMOKE FAILED');
    process.exit(1);
  }
})().catch((err) => {
  console.error('SMOKE ERROR', err.message);
  process.exit(1);
});
