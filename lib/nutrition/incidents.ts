import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { plansRepository } from '@/lib/db/repositories/plans.repo';

// NUT-06 incident hook: a reported plan is archived (never silently kept
// live) and appended as a permanent QA regression case (QA-08). The caller
// (route layer) owns the audit_log write, per project layering.
export interface IncidentRecord {
  planId: string;
  reason: string;
  reporterId: string | null;
  archived: boolean;
  recordedAt: string;
}

export function regressionDir(customDir?: string): string {
  return customDir ?? join(process.cwd(), 'qa-regressions');
}

export async function reportIncident(planId: string, reason: string, reporterId: string | null = null, customDir?: string): Promise<IncidentRecord> {
  const plan = await plansRepository.findById(planId);
  let archived = false;
  if (plan && plan.status !== 'archived') {
    await plansRepository.archive(planId);
    archived = true;
  }
  const record: IncidentRecord = {
    planId,
    reason: reason.slice(0, 2000),
    reporterId,
    archived,
    recordedAt: new Date().toISOString(),
  };
  const dir = regressionDir(customDir);
  try {
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'nutrition.jsonl'), JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // Regression capture must never break the archive path itself.
  }
  return record;
}
