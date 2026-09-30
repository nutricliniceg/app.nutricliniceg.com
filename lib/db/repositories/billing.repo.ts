import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'trial' | 'active' | 'grace' | 'expired' | 'cancelled' | 'pending_payment';
  payment_method: 'paymob' | 'manual' | 'bank_transfer' | null;
  payment_reference: string | null;
  reminder_7d_sent: boolean | number;
  reminder_3d_sent: boolean | number;
  reminder_0d_sent: boolean | number;
  started_at: Date;
  ends_at: Date;
}

export interface ManualRequestRow {
  id: string;
  user_id: string;
  plan_id: string;
  method: 'manual' | 'bank_transfer';
  reference: string;
  status: 'pending' | 'approved' | 'rejected';
  review_reason: string | null;
  created_at: Date;
}

export interface PaymobTxnRow {
  id: string;
  user_id: string;
  plan_id: string | null;
  paymob_transaction_id: string;
  amount_cents: number;
  currency: string;
  success: boolean | number;
  raw_payload: string;
}

export const billingRepository = {
  async latestForUser(userId: string): Promise<SubscriptionRow | null> {
    const rows = await executeQuery<SubscriptionRow[]>(
      'SELECT * FROM Subscription WHERE user_id = ? ORDER BY ends_at DESC LIMIT 1',
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async findSubscriptionById(id: string): Promise<SubscriptionRow | null> {
    const rows = await executeQuery<SubscriptionRow[]>(
      'SELECT * FROM Subscription WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async insertSubscription(data: {
    userId: string; planId: string; status: SubscriptionRow['status'];
    paymentMethod?: SubscriptionRow['payment_method']; paymentReference?: string | null; endsAt: Date;
  }): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      `INSERT INTO Subscription (id, user_id, plan_id, status, payment_method, payment_reference, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, data.userId, data.planId, data.status, data.paymentMethod ?? null, data.paymentReference ?? null, data.endsAt]
    );
    return id;
  },

  async updateSubscription(id: string, patch: { status?: SubscriptionRow['status']; endsAt?: Date; paymentMethod?: SubscriptionRow['payment_method']; paymentReference?: string | null }): Promise<void> {
    const fields: string[] = [];
    const values: Array<string | Date | null> = [];
    if (patch.status !== undefined) {
      fields.push('status = ?');
      values.push(patch.status);
    }
    if (patch.endsAt !== undefined) {
      fields.push('ends_at = ?');
      values.push(patch.endsAt);
    }
    if (patch.paymentMethod !== undefined) {
      fields.push('payment_method = ?');
      values.push(patch.paymentMethod);
    }
    if (patch.paymentReference !== undefined) {
      fields.push('payment_reference = ?');
      values.push(patch.paymentReference);
    }
    if (fields.length === 0) return;
    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- SET columns are fixed literals; values use ? placeholders (D-01)
    await executeQuery(`UPDATE Subscription SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async markReminder(id: string, which: 'reminder_7d_sent' | 'reminder_3d_sent' | 'reminder_0d_sent'): Promise<void> {
    const allowed = { reminder_7d_sent: true, reminder_3d_sent: true, reminder_0d_sent: true } as const;
    if (!allowed[which]) return;
    // eslint-disable-next-line no-restricted-syntax -- column comes from a fixed allowlist; values use ? placeholders (D-01)
    await executeQuery(`UPDATE Subscription SET ${which} = TRUE WHERE id = ?`, [id]);
  },

  // CRON-01 candidates: live subscriptions near or past their end date.
  async expiringCandidates(now: Date): Promise<SubscriptionRow[]> {
    return executeQuery<SubscriptionRow[]>(
      `SELECT * FROM Subscription WHERE status IN ('trial','active','grace')
       AND ends_at <= DATE_ADD(?, INTERVAL 3 DAY)`,
      [now]
    );
  },

  // CRON-03/04/05: live subs ending in ~7/3/0 days with the flag unset.
  async reminderCandidates(days: 7 | 3 | 0, now: Date): Promise<SubscriptionRow[]> {
    const col = days === 7 ? 'reminder_7d_sent' : days === 3 ? 'reminder_3d_sent' : 'reminder_0d_sent';
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const lo = new Date(start);
    lo.setDate(lo.getDate() + days);
    const hi = new Date(end);
    hi.setDate(hi.getDate() + days);
    return executeQuery<SubscriptionRow[]>(
      // eslint-disable-next-line no-restricted-syntax -- column comes from a fixed allowlist; values use ? placeholders (D-01)
      `SELECT * FROM Subscription WHERE status IN ('trial','active') AND ${col} = FALSE AND ends_at >= ? AND ends_at < ?`,
      [lo, hi]
    );
  },

  async insertManualRequest(data: { userId: string; planId: string; method: 'manual' | 'bank_transfer'; reference: string }): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      'INSERT INTO ManualPaymentRequest (id, user_id, plan_id, method, reference) VALUES (?, ?, ?, ?, ?)',
      [id, data.userId, data.planId, data.method, data.reference]
    );
    return id;
  },

  async listManualRequests(status?: string): Promise<ManualRequestRow[]> {
    if (status) {
      return executeQuery<ManualRequestRow[]>('SELECT * FROM ManualPaymentRequest WHERE status = ? ORDER BY created_at DESC LIMIT 200', [status]);
    }
    return executeQuery<ManualRequestRow[]>('SELECT * FROM ManualPaymentRequest ORDER BY created_at DESC LIMIT 200');
  },

  async findManualRequest(id: string): Promise<ManualRequestRow | null> {
    const rows = await executeQuery<ManualRequestRow[]>('SELECT * FROM ManualPaymentRequest WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  },

  async reviewManualRequest(id: string, status: 'approved' | 'rejected', reviewedBy: string, reason: string | null): Promise<void> {
    await executeQuery(
      'UPDATE ManualPaymentRequest SET status = ?, reviewed_by = ?, reviewed_at = ?, review_reason = ? WHERE id = ? AND status = ?',
      [status, reviewedBy, new Date(), reason, id, 'pending']
    );
  },

  async findPaymobTxn(paymobTransactionId: string): Promise<PaymobTxnRow | null> {
    const rows = await executeQuery<PaymobTxnRow[]>(
      'SELECT * FROM PaymobTransaction WHERE paymob_transaction_id = ?',
      [paymobTransactionId]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async insertPaymobTxn(data: { userId: string; planId: string | null; paymobTransactionId: string; amountCents: number; currency: string; success: boolean; rawPayload: unknown }): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      'INSERT INTO PaymobTransaction (id, user_id, plan_id, paymob_transaction_id, amount_cents, currency, success, raw_payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.userId, data.planId, data.paymobTransactionId, data.amountCents, data.currency, data.success, JSON.stringify(data.rawPayload)]
    );
    return id;
  },

  async successfulTxns(): Promise<PaymobTxnRow[]> {
    return executeQuery<PaymobTxnRow[]>('SELECT * FROM PaymobTransaction WHERE success = TRUE ORDER BY created_at DESC LIMIT 1000');
  },

  async subscriptionsForUser(userId: string): Promise<SubscriptionRow[]> {
    return executeQuery<SubscriptionRow[]>(
      'SELECT * FROM Subscription WHERE user_id = ? ORDER BY ends_at DESC LIMIT 50',
      [userId]
    );
  },
};
