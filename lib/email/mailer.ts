import nodemailer from 'nodemailer';
import { env } from '@/lib/env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: true, // true for 465, false for other ports
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD,
  },
});

// Simple in-memory rate limiter for the hour (to be replaced by DB for production)
const usage = { count: 0, lastReset: Date.now() };

export async function sendEmail({
  to,
  subject,
  html,
  text,
  fromAlias = 'info',
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromAlias?: 'info' | 'no-reply' | 'admin';
}): Promise<void> {
  // Simple check for hourly limit (300/h)
  const now = Date.now();
  if (now - usage.lastReset > 3600000) {
    usage.count = 0;
    usage.lastReset = now;
  }
  if (usage.count >= 300) {
    throw new Error('Hourly email limit exceeded');
  }

  const fromMap = {
    info: 'info@nutricliniceg.com',
    'no-reply': 'no-reply@nutricliniceg.com',
    admin: 'admin@nutricliniceg.com',
  };

  await transporter.sendMail({
    from: `"${fromAlias.toUpperCase()}" <${fromMap[fromAlias]}>`,
    to,
    subject,
    text,
    html,
  });

  usage.count++;
}
