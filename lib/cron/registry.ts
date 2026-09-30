// CRON-02 registry: task id → schedule + description. cPanel runs each
// line below with curl; schedules live in docs/cron-operations.md.
export interface CronTaskDef {
  id: string;
  schedule: string;
  description: string;
}

export const CRON_TASKS: CronTaskDef[] = [
  { id: 'expire-subscriptions', schedule: '0 2 * * *', description: 'CRON-01 expire subscriptions past grace' },
  { id: 'reminders-7d', schedule: '0 9 * * *', description: 'CRON-03 7-day renewal reminders' },
  { id: 'reminders-3d', schedule: '0 9 * * *', description: 'CRON-04 3-day renewal reminders' },
  { id: 'reminders-0d', schedule: '0 9 * * *', description: 'CRON-05 expiry-day reminders' },
  { id: 'doctor-digest', schedule: '0 8 * * *', description: 'CRON-06 daily doctor digest of unread messages' },
  { id: 'backup', schedule: '0 3 * * *', description: 'CRON-07 encrypted mysqldump + retention + off-server upload' },
  { id: 'cleanup', schedule: '0 4 * * 0', description: 'CRON-08 weekly cleanup (OTPs, temp files, stale logs)' },
  { id: 'ai-health', schedule: '0 */6 * * *', description: 'CRON-09 AI provider probe + auto re-enable' },
  { id: 'publish-posts', schedule: '*/15 * * * *', description: 'CRON-10 publish scheduled posts + auto-campaigns' },
  { id: 'newsletter-send', schedule: '*/5 * * * *', description: 'CRON-11 newsletter batch sender (50/round)' },
  { id: 'newsletter-cleanup', schedule: '0 4 * * *', description: 'CRON-12 newsletter cleanup + bounce reminder' },
  { id: 'reconcile-payments', schedule: '0 5 * * *', description: 'CRON-13 payment reconciliation report' },
  { id: 'ai-retry', schedule: '*/10 * * * *', description: 'CRON-14 AI retry queue drain (5 attempts max)' },
  { id: 'activation-reminders', schedule: '0 */12 * * *', description: 'CRON-15 pending-activation >24h reminders' },
  { id: 'backup-verify', schedule: '0 6 * * 0', description: 'SEC-22 weekly restore-into-scratch verification' },
];

export function cronLine(taskId: string, appUrl: string): string {
  const def = CRON_TASKS.find((t) => t.id === taskId);
  const schedule = def ? def.schedule : '* * * * *';
  return `${schedule} curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" "${appUrl}/api/cron/${taskId}" >> ~/cron.log 2>&1`;
}
