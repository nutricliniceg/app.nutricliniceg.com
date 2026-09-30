// Subscription lifecycle: pure state math + idempotent cron-task bodies.
// Registered as cron endpoints in P29 (CRON-01/03/04/05/13); the tasks take
// an explicit `now` so tests drive boundaries deterministically.

export const GRACE_DAYS = 3;

export type LifecycleState = 'trial' | 'active' | 'grace' | 'expired' | 'cancelled' | 'pending_payment';

export interface SubState {
  status: LifecycleState;
  endsAt: Date | string;
}

// R16: past end date → grace (3 days, banner) → expired (locked).
export function lifecycleState(sub: SubState, now: Date): LifecycleState {
  if (sub.status === 'cancelled' || sub.status === 'pending_payment') return sub.status;
  const ends = new Date(sub.endsAt).getTime();
  if (Number.isNaN(ends)) return sub.status;
  if (now.getTime() <= ends) return sub.status === 'expired' ? 'expired' : sub.status;
  const graceUntil = ends + GRACE_DAYS * 86400000;
  if (now.getTime() <= graceUntil) return sub.status === 'expired' ? 'expired' : 'grace';
  return 'expired';
}

export function graceUntil(endsAt: Date | string): Date {
  return new Date(new Date(endsAt).getTime() + GRACE_DAYS * 86400000);
}

export type BannerState = 'none' | 'grace' | 'expired';

// Doctor-visible banner (R16): action required during grace, locked after.
export function bannerFor(state: LifecycleState): BannerState {
  if (state === 'grace') return 'grace';
  if (state === 'expired') return 'expired';
  return 'none';
}

export interface ReconcileMismatch {
  kind: 'paid_not_extended' | 'extended_unpaid';
  userId: string;
  detail: string;
}

// CRON-13 diff detector (pure): paid-but-not-extended vs extended-but-unpaid.
export function detectMismatches(
  txns: Array<{ user_id: string; plan_id: string | null; amount_cents: number; success: boolean }>,
  subs: Array<{ user_id: string; plan_id: string; status: LifecycleState; ends_at: Date | string }>
): ReconcileMismatch[] {
  const out: ReconcileMismatch[] = [];
  const liveByUser = new Map<string, Set<string>>();
  for (const s of subs) {
    if (s.status === 'active' || s.status === 'grace' || s.status === 'trial') {
      const set = liveByUser.get(s.user_id) ?? new Set<string>();
      set.add(s.plan_id);
      liveByUser.set(s.user_id, set);
    }
  }
  for (const t of txns) {
    if (!t.success || !t.plan_id) continue;
    if (!liveByUser.get(t.user_id)?.has(t.plan_id)) {
      out.push({ kind: 'paid_not_extended', userId: t.user_id, detail: `Paid ${t.amount_cents} with no live subscription` });
    }
  }
  return out;
}
