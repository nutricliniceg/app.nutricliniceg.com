import { vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: () => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual('@/lib/env');
  return {
    ...actual,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-key-at-least-32-chars-long-for-testing',
      ENCRYPTION_KEY: 'test-encryption-key-at-least-32-chars',
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: 3306,
      DATABASE_USER: 'test',
      DATABASE_PASSWORD: 'test',
      DATABASE_NAME: 'test',
      SMTP_HOST: 'localhost',
      SMTP_PORT: 465,
      SMTP_USER: 'test',
      SMTP_PASSWORD: 'test',
      SMTP_FROM: 'test@example.com',
      APP_URL: 'http://localhost:3000',
      CRON_SECRET: 'test-cron-secret-at-least-16-chars',
      SENTRY_DSN: '',
      PAYMOB_PUBLIC_KEY: '',
      PAYMOB_SECRET_KEY: '',
      PAYMOB_API_KEY: '',
      PAYMOB_INTEGRATION_ID: '',
      TURNSTILE_SECRET_KEY: '',
      AUDIT_IP_SALT: 'test-salt',
    },
  };
});