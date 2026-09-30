import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

export interface SubscriberRow {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  status: 'pending' | 'confirmed' | 'unsubscribed' | 'bounced';
  source: string | null;
  confirm_token: string | null;
  unsub_token: string;
  confirmed_at: Date | null;
  unsubscribed_at: Date | null;
  ip_hash: string | null;
  created_at: Date;
}

export const subscribersRepository = {
  async findByEmail(email: string): Promise<SubscriberRow | null> {
    const rows = await executeQuery<SubscriberRow[]>('SELECT * FROM NewsletterSubscriber WHERE email = ?', [email.toLowerCase()]);
    return rows.length > 0 ? rows[0] : null;
  },

  async findByConfirmToken(token: string): Promise<SubscriberRow | null> {
    const rows = await executeQuery<SubscriberRow[]>('SELECT * FROM NewsletterSubscriber WHERE confirm_token = ?', [token]);
    return rows.length > 0 ? rows[0] : null;
  },

  async findByUnsubToken(token: string): Promise<SubscriberRow | null> {
    const rows = await executeQuery<SubscriberRow[]>('SELECT * FROM NewsletterSubscriber WHERE unsub_token = ?', [token]);
    return rows.length > 0 ? rows[0] : null;
  },

  async insert(data: { email: string; name: string | null; locale: string; source: string; confirmToken: string; unsubToken: string; ipHash: string | null }): Promise<string> {
    const id = randomUUID();
    await executeQuery(
      'INSERT INTO NewsletterSubscriber (id, email, name, locale, status, source, confirm_token, unsub_token, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.email.toLowerCase(), data.name, data.locale, 'pending', data.source, data.confirmToken, data.unsubToken, data.ipHash]
    );
    return id;
  },

  async refreshConfirmToken(id: string, token: string): Promise<void> {
    await executeQuery('UPDATE NewsletterSubscriber SET confirm_token = ?, created_at = ? WHERE id = ?', [token, new Date(), id]);
  },

  async confirm(id: string): Promise<void> {
    await executeQuery(
      'UPDATE NewsletterSubscriber SET status = ?, confirm_token = NULL, confirmed_at = ? WHERE id = ? AND status = ?',
      ['confirmed', new Date(), id, 'pending']
    );
  },

  async unsubscribe(id: string): Promise<void> {
    await executeQuery(
      "UPDATE NewsletterSubscriber SET status = 'unsubscribed', unsubscribed_at = ? WHERE id = ? AND status <> 'unsubscribed'",
      [new Date(), id]
    );
  },

  async hardDelete(id: string): Promise<boolean> {
    const res = await executeQuery<{ affectedRows: number }>('DELETE FROM NewsletterSubscriber WHERE id = ?', [id]);
    return (res as unknown as { affectedRows?: number }).affectedRows !== 0;
  },

  async list(filters: { status?: string; locale?: string; q?: string; page?: number; limit?: number }): Promise<{ rows: SubscriberRow[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 500);
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (filters.status) {
      where.push('status = ?');
      params.push(filters.status);
    }
    if (filters.locale) {
      where.push('locale = ?');
      params.push(filters.locale);
    }
    if (filters.q) {
      where.push('(email LIKE ? OR name LIKE ?)');
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    const clause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await executeQuery<SubscriberRow[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT * FROM NewsletterSubscriber ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalRows = await executeQuery<{ count: number }[]>(
      // eslint-disable-next-line no-restricted-syntax -- WHERE fragments are fixed; values use ? placeholders (D-01)
      `SELECT COUNT(*) as count FROM NewsletterSubscriber ${clause}`,
      params
    );
    return { rows, total: totalRows[0].count };
  },

  async stats(): Promise<{ byStatus: Array<{ status: string; count: number }>; byLocale: Array<{ locale: string; count: number }>; growth: Array<{ month: string; count: number }> }> {
    const [byStatus, byLocale, growth] = await Promise.all([
      executeQuery<Array<{ status: string; count: number }>>('SELECT status, COUNT(*) as count FROM NewsletterSubscriber GROUP BY status'),
      executeQuery<Array<{ locale: string; count: number }>>('SELECT locale, COUNT(*) as count FROM NewsletterSubscriber GROUP BY locale'),
      executeQuery<Array<{ month: string; count: number }>>(
        "SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count FROM NewsletterSubscriber WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH) GROUP BY month ORDER BY month ASC"
      ),
    ]);
    return {
      byStatus: byStatus.map((r) => ({ ...r, count: Number(r.count) })),
      byLocale: byLocale.map((r) => ({ ...r, count: Number(r.count) })),
      growth: growth.map((r) => ({ ...r, count: Number(r.count) })),
    };
  },

  async confirmedEmails(locale?: string): Promise<Array<{ email: string; locale: string; unsub_token: string; name: string | null }>> {
    const rows = locale
      ? await executeQuery<Array<{ email: string; locale: string; unsub_token: string; name: string | null }>>(
          "SELECT email, locale, unsub_token, name FROM NewsletterSubscriber WHERE status = 'confirmed' AND locale = ?",
          [locale]
        )
      : await executeQuery<Array<{ email: string; locale: string; unsub_token: string; name: string | null }>>(
          "SELECT email, locale, unsub_token, name FROM NewsletterSubscriber WHERE status = 'confirmed'"
        );
    return rows;
  },
};
