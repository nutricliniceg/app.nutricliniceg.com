import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn().mockResolvedValue({}) }));

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

import { sendEmail } from '@/lib/email/mailer';

describe('mailer', () => {
  beforeEach(() => {
    sendMail.mockClear();
  });

  it('maps fromAlias to the correct sender', async () => {
    await sendEmail({ to: 'a@x.com', subject: 's', html: '<p>h</p>', text: 't', fromAlias: 'no-reply' });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: '"NO-REPLY" <no-reply@nutricliniceg.com>', to: 'a@x.com' })
    );
  });

  it('defaults to the info alias', async () => {
    await sendEmail({ to: 'a@x.com', subject: 's', html: '<p>h</p>', text: 't' });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: '"INFO" <info@nutricliniceg.com>' })
    );
  });

  it('enforces the hourly cap of 300', async () => {
    for (let i = 0; i < 300; i++) {
      await sendEmail({ to: 'a@x.com', subject: 's', html: 'h', text: 't' }).catch(() => {});
    }
    await expect(
      sendEmail({ to: 'a@x.com', subject: 's', html: 'h', text: 't' })
    ).rejects.toThrow('Hourly email limit exceeded');
  });
});
