import { describe, it, expect, vi, beforeEach } from 'vitest';

const { enqueueCalls, confirmedList, markCalls, bumpCalls } = vi.hoisted(() => ({
  enqueueCalls: [] as Array<{ c: string; s: string }>,
  confirmedList: [] as Array<{ id: string; email: string; locale: string; unsub_token: string; status: string }>,
  markCalls: [] as Array<{ id: string; status: string }>,
  bumpCalls: [] as Array<{ sent: number; failed: number }>,
}));

vi.mock('@/lib/db/repositories/campaigns.repo', () => ({
  campaignsRepository: {
    insert: vi.fn(async () => 'camp-1'),
    findById: vi.fn(async (id: string) => ({
      id, post_id: null, subject: 'S', body_html: '<p><a href="https://x.com/a">a</a></p>',
      body_text: 't', locale: 'ar', auto_generated: false, audience_rule: 'locale_exact',
      status: 'scheduled', scheduled_at: new Date(Date.now() - 1000),
      total_count: 0, sent_count: 0, failed_count: 0, click_count: 0, sent_at: null, created_at: new Date(),
    })),
    findAutoByPostId: vi.fn(async () => []),
    update: vi.fn(async () => undefined),
    bumpCounters: vi.fn(async (_id: string, s: number, f: number) => { bumpCalls.push({ sent: s, failed: f }); }),
    incrementClicks: vi.fn(async () => undefined),
    markSent: vi.fn(async () => undefined),
    enqueue: vi.fn(async (c: string, s: string) => { enqueueCalls.push({ c, s }); return true; }),
    nextBatch: vi.fn(async () => [{ id: 'send-1', campaign_id: 'camp-1', subscriber_id: 'sub-1', status: 'queued', attempts: 0, error_message: null, sent_at: null }]),
    failedRetryable: vi.fn(async () => []),
    markSend: vi.fn(async (id: string, status: string) => { markCalls.push({ id, status }); }),
    report: vi.fn(async () => ({ sent: 1, failed: 0, queued: 0, skipped: 0 })),
    dueCampaigns: vi.fn(async () => [{
      id: 'camp-1', post_id: null, subject: 'S', body_html: '<p>hi</p>', body_text: 'hi',
      locale: 'ar', auto_generated: false, audience_rule: 'locale_exact',
      status: 'scheduled', scheduled_at: new Date(Date.now() - 1000),
      total_count: 0, sent_count: 0, failed_count: 0, click_count: 0, sent_at: null, created_at: new Date(),
    }]),
  },
}));

vi.mock('@/lib/db/repositories/subscribers.repo', () => ({
  subscribersRepository: {
    findByEmail: vi.fn(async (email: string) => confirmedList.find((r) => r.email === email) ?? null),
    confirmedEmails: vi.fn(async () => confirmedList.map((r) => ({ email: r.email, locale: r.locale, unsub_token: r.unsub_token, name: null }))),
    list: vi.fn(async () => ({ rows: confirmedList, total: confirmedList.length })),
  },
}));

vi.mock('@/lib/email/mailer', () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock('@/lib/newsletter/newsletter.service', () => ({
  isSuppressed: vi.fn(async (email: string) => !confirmedList.some((r) => r.email === email && r.status === 'confirmed')),
}));

import { campaignsService, tagLinks, CAMPAIGN_BATCH_SIZE, MAX_SEND_ATTEMPTS } from '@/lib/newsletter/campaigns.service';

beforeEach(() => {
  enqueueCalls.length = 0;
  markCalls.length = 0;
  bumpCalls.length = 0;
  confirmedList.length = 0;
});

describe('P28 newsletter campaigns', () => {
  it('batch constant is 50 and retry cap is 3 (NL-12/NL-18)', () => {
    expect(CAMPAIGN_BATCH_SIZE).toBe(50);
    expect(MAX_SEND_ATTEMPTS).toBe(3);
  });

  it('tagLinks rewrites outbound hrefs through the click endpoint (NL-22)', () => {
    const out = tagLinks('<p><a href="https://example.com/a">a</a></p>', 'c1', 's1');
    expect(out).toContain('/api/newsletter/click?c=c1&s=s1&u=');
    expect(out).toContain(encodeURIComponent('https://example.com/a'));
  });

  it('locale_exact skips other-locale confirmed subscribers', async () => {
    confirmedList.push(
      { id: 'a', email: 'a@x.com', locale: 'ar', unsub_token: 'u1', status: 'confirmed' },
      { id: 'e', email: 'e@x.com', locale: 'en', unsub_token: 'u2', status: 'confirmed' },
    );
    const { queued } = await campaignsService.launch('camp-1');
    expect(queued).toBe(1);
    expect(enqueueCalls.map((c) => c.s)).toEqual(['a']);
  });

  it('suppressed (unconfirmed) rows are never queued (NL-06)', async () => {
    confirmedList.push({ id: 'p', email: 'p@x.com', locale: 'ar', unsub_token: 'u3', status: 'pending' });
    const { queued } = await campaignsService.launch('camp-1');
    expect(queued).toBe(0);
    expect(enqueueCalls.length).toBe(0);
  });

  it('autoFromPost is a no-op when opted out or already locked (NL-27)', async () => {
    const base = { id: 'p1', slug: 's', locale: 'ar', title: 'T', excerpt: null, featured_image: null, published_at: new Date(), translations: [] };
    expect((await campaignsService.autoFromPost({ ...base, newsletter_sent_at: null, send_newsletter: false })).ids).toEqual([]);
    expect((await campaignsService.autoFromPost({ ...base, newsletter_sent_at: new Date(), send_newsletter: true })).ids).toEqual([]);
  });

  it('autoFromPost creates one fallback campaign for a single-locale post (NL-30)', async () => {
    const { ids } = await campaignsService.autoFromPost({
      id: 'p1', slug: 's', locale: 'ar', title: 'T', excerpt: 'E', featured_image: null,
      newsletter_sent_at: null, send_newsletter: true, published_at: new Date(), translations: [],
    });
    expect(ids).toEqual(['camp-1']);
  });

  it('processDue sends one batch and marks sent when the queue drains', async () => {
    confirmedList.push({ id: 'sub-1', email: 'a@x.com', locale: 'ar', unsub_token: 'u1', status: 'confirmed' });
    const res = await campaignsService.processDue();
    expect(res.campaigns).toBe(1);
    expect(res.sent).toBe(1);
    expect(markCalls).toEqual([{ id: 'send-1', status: 'sent' }]);
    expect(bumpCalls).toEqual([{ sent: 1, failed: 0 }]);
  });

  it('processDue skips suppressed recipients at send time (NL-06)', async () => {
    confirmedList.push({ id: 'sub-1', email: 'a@x.com', locale: 'ar', unsub_token: 'u1', status: 'pending' });
    const res = await campaignsService.processDue();
    expect(res.sent).toBe(0);
    expect(markCalls).toEqual([{ id: 'send-1', status: 'skipped' }]);
  });
});
