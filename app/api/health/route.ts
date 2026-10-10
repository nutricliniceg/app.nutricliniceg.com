import { NextRequest } from 'next/server';
import { ok } from '@/lib/api/response';
import { maintenanceRepository } from '@/lib/db/repositories/maintenance.repo';
import { cronRepository } from '@/lib/db/repositories/cron.repo';
import { aiProviderRepository } from '@/lib/db/repositories/ai.repo';
import { setRequestId, newRequestId } from '@/lib/observability/logger';

// PF-12: full health probe. Reveals component statuses, NEVER secrets.
let smtpCache: { at: number; ok: boolean } | null = null;

async function dbPing(): Promise<{ ok: boolean; latencyMs: number }> {
  const t = Date.now();
  try {
    await maintenanceRepository.ping();
    return { ok: true, latencyMs: Date.now() - t };
  } catch {
    return { ok: false, latencyMs: Date.now() - t };
  }
}

async function smtpCheck(): Promise<{ ok: boolean; cached: boolean }> {
  if (smtpCache && Date.now() - smtpCache.at < 5 * 60_000) {
    return { ok: smtpCache.ok, cached: true };
  }
  try {
    const nodemailer = (await import('nodemailer')).default;
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await t.verify();
    smtpCache = { at: Date.now(), ok: true };
    return { ok: true, cached: false };
  } catch {
    smtpCache = { at: Date.now(), ok: false };
    return { ok: false, cached: false };
  }
}

export async function GET(_request: NextRequest) {
  const requestId = newRequestId();
  setRequestId(requestId);
  const [db, smtp, providers, cronRuns] = await Promise.all([
    dbPing(),
    smtpCheck(),
    aiProviderRepository.listChain().catch(() => []),
    cronRepository.lastRuns(20).catch(() => []),
  ]);
  const providerStatuses = providers.map((p) => ({
    id: p.id, type: p.type, enabled: Boolean(p.is_enabled),
    failures: Number(p.failure_count ?? 0),
  }));
  const body = {
    status: db.ok ? 'ok' : 'degraded',
    // Surfaced so an operator can correlate a degraded probe with the JSON logs
    // (OBS-03); it is a fresh UUID, never any secret.
    requestId,
    components: {
      db,
      smtp,
      ai: {
        providers: providerStatuses,
        allDown: providerStatuses.length > 0 && providerStatuses.every((p) => !p.enabled || p.failures > 0),
      },
      cron: cronRuns.map((r) => ({ task: r.task, status: r.status, startedAt: r.started_at, failures: Number(r.consecutive_failures) })),
    },
  };
  setRequestId(null);
  return ok(body);
}
