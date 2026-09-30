import { describe, it, expect, vi, beforeEach } from 'vitest';
import { newsletterService, isSuppressed, NEUTRAL_MESSAGE } from '@/lib/newsletter/newsletter.service';
import { parseSubscriberCsv, subscribersToCsv, confirmExpired } from '@/lib/newsletter/tokens-csv';
import { subscribersRepository } from '@/lib/db/repositories/subscribers.repo';
import { sendEmail } from '@/lib/email/mailer';

vi.mock('@/lib/db/repositories/subscribers.repo', () => ({
  subscribersRepository: {
    findByEmail: vi.fn(), findByConfirmToken: vi.fn(), findByUnsubToken: vi.fn(),
    insert: vi.fn().mockResolvedValue('sub-1'), refreshConfirmToken: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue(undefined), unsubscribe: vi.fn().mockResolvedValue(undefined),
    hardDelete: vi.fn().mockResolvedValue(true), list: vi.fn(), stats: vi.fn(),
    confirmedEmails: vi.fn(),
  },
}));

vi.mock('@/lib/email/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

type Mock = ReturnType<typeof vi.fn>;

function row(overrides = {}) {
  return {
    id: 's1', email: 'a@x.com', name: null, locale: 'ar', status: 'pending',
    source: 'footer', confirm_token: 'tok', unsub_token: 'unsub',
    confirmed_at: null, unsubscribed_at: null, ip_hash: null,
    created_at: new Date(), ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('P27 double opt-in: pending never receives', () => {
  it('only confirmed rows pass suppression', async () => {
    (subscribersRepository.findByEmail as Mock).mockResolvedValue(row({ status: 'pending' }));
    expect(await isSuppressed('a@x.com')).toBe(true);
    (subscribersRepository.findByEmail as Mock).mockResolvedValue(row({ status: 'confirmed' }));
    expect(await isSuppressed('a@x.com')).toBe(false);
    (subscribersRepository.findByEmail as Mock).mockResolvedValue(null);
    expect(await isSuppressed('nope@x.com')).toBe(true);
  });
});

describe('P27 confirm single-use + 48h expiry', () => {
  it('confirms once, then the token is dead', async () => {
    (subscribersRepository.findByConfirmToken as Mock).mockResolvedValue(row());
    expect(await newsletterService.confirm('tok')).toEqual({ ok: true });
    expect(subscribersRepository.confirm as Mock).toHaveBeenCalledWith('s1');
    (subscribersRepository.findByConfirmToken as Mock).mockResolvedValue(null);
    expect(await newsletterService.confirm('tok')).toEqual({ ok: false });
  });

  it('rejects expired tokens', async () => {
    (subscribersRepository.findByConfirmToken as Mock).mockResolvedValue(row({ created_at: new Date(Date.now() - 49 * 3600000) }));
    expect(await newsletterService.confirm('old')).toEqual({ ok: false });
    expect(subscribersRepository.confirm as Mock).not.toHaveBeenCalled();
    expect(confirmExpired(new Date(Date.now() - 49 * 3600000))).toBe(true);
    expect(confirmExpired(new Date())).toBe(false);
  });
});

describe('P27 unsubscribe immediate + suppression', () => {
  it('unsubscribes by token and blocks re-entry', async () => {
    (subscribersRepository.findByUnsubToken as Mock).mockResolvedValue(row({ status: 'confirmed' }));
    expect(await newsletterService.unsubscribe('unsub')).toEqual({ ok: true });
    expect(subscribersRepository.unsubscribe as Mock).toHaveBeenCalledWith('s1');
    // Re-subscribe attempt on a suppressed address stays neutral, no email.
    (subscribersRepository.findByEmail as Mock).mockResolvedValue(row({ status: 'unsubscribed' }));
    const out = await newsletterService.subscribe({ email: 'a@x.com' }, '1.2.3.4');
    expect(out.message).toBe(NEUTRAL_MESSAGE);
    expect(sendEmail as Mock).not.toHaveBeenCalled();
  });
});

describe('P27 neutral duplicates', () => {
  it('confirmed duplicates get the same message with no email', async () => {
    (subscribersRepository.findByEmail as Mock).mockResolvedValue(row({ status: 'confirmed' }));
    const out = await newsletterService.subscribe({ email: 'a@x.com' }, '1.2.3.4');
    expect(out.message).toBe(NEUTRAL_MESSAGE);
    expect(sendEmail as Mock).not.toHaveBeenCalled();
  });

  it('honeypot submissions store nothing', async () => {
    const out = await newsletterService.subscribe({ email: 'bot@x.com', website: 'http://spam' }, '9.9.9.9');
    expect(out.message).toBe(NEUTRAL_MESSAGE);
    expect(subscribersRepository.insert as Mock).not.toHaveBeenCalled();
  });
});

describe('P27 CSV round-trip', () => {
  it('parses and re-emits subscriber rows', () => {
    const rows = parseSubscriberCsv('email,name,locale\na@x.com,Ali,ar\nbad-row\nb@y.com,,en\n');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ email: 'a@x.com', name: 'Ali', locale: 'ar' });
    const csv = subscribersToCsv(rows.map((r) => ({ ...r, status: 'pending' })));
    expect(parseSubscriberCsv(csv)).toHaveLength(2);
  });

  it('import skips existing (suppression survives re-import)', async () => {
    (subscribersRepository.findByEmail as Mock).mockImplementation(async (email: string) => {
      if (email === 'old@x.com') return row({ email, status: 'unsubscribed' });
      return null;
    });
    const out = await newsletterService.importCsv('email,name,locale\nold@x.com,Old,ar\nnew@x.com,New,ar\n');
    expect(out).toEqual({ imported: 1, skipped: 1 });
    expect(subscribersRepository.insert as Mock).toHaveBeenCalledTimes(1);
  });
});
