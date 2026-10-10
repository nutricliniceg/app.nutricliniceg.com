import { userRepository } from '@/lib/db/repositories/users.repo';
import { notificationService } from '@/lib/notifications/service';

// ADM/CRON admin-alert fan-out, deduplicated from five near-identical copies
// (auth.service, billing.service, billing/tasks, cron/tasks, cron/runner).
//
// Two loaders are kept because callers historically used two different ones
// and switching them would change which recipients are notified:
//   - pagedAdmins()   -> listDoctors(1, 100)  (cap of 100)
//   - allAdmins()     -> listAllForBroadcast(null) (uncapped)
// Alerting is ALWAYS best-effort per recipient and never throws: a failing
// notification must not break the business operation or the cron task that
// triggered it (CRON-11).

function isAdmin(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

async function pagedAdmins(): Promise<Array<{ id: string }>> {
  const { users } = await userRepository.listDoctors(1, 100);
  return users.filter((u) => isAdmin(u.role));
}

async function allAdmins(): Promise<Array<{ id: string }>> {
  const admins = await userRepository.listAllForBroadcast(null);
  return admins.filter((u) => isAdmin(u.role));
}

export interface AdminAlert {
  title: string;
  body: string;
  /** Optional deep-link target shown with the notification. */
  link?: string;
  /** Per-recipient failure isolation. Defaults to isolated best-effort. */
  isolate?: boolean;
}

async function fanOut(admins: Array<{ id: string }>, alert: AdminAlert, isolate: boolean): Promise<void> {
  for (const admin of admins) {
    const send = notificationService.notify({
      userId: admin.id,
      title: alert.title,
      body: alert.body,
      type: 'system',
      link: alert.link,
    });
    if (isolate) await send.catch(() => undefined);
    else await send;
  }
}

/** Fan out to admins via the paged (max 100) doctor list. */
export async function notifyPagedAdmins(alert: AdminAlert): Promise<void> {
  const admins = await pagedAdmins();
  await fanOut(admins, alert, alert.isolate ?? true);
}

/** Fan out to admins via the uncapped broadcast list. Never throws. */
export async function notifyAllAdmins(alert: AdminAlert): Promise<void> {
  try {
    const admins = await allAdmins();
    await fanOut(admins, alert, alert.isolate ?? false);
  } catch {
    // Never fail a cron task on alerting (CRON-11).
  }
}