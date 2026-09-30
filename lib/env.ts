import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  JWT_SECRET: z.string().min(32, {
    message: 'JWT_SECRET must be at least 32 characters long for cryptographic security (SEC-01).',
  }),

  ENCRYPTION_KEY: z.string().min(32, {
    message: 'ENCRYPTION_KEY must be at least 32 characters long (32 bytes equivalent).',
  }),

  DATABASE_HOST: z.string().min(1, 'DATABASE_HOST is required'),
  DATABASE_PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int()),
  DATABASE_USER: z.string().min(1, 'DATABASE_USER is required'),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string().min(1, 'DATABASE_NAME is required'),

  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required'),
  SMTP_PORT: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int()),
  SMTP_USER: z.string().min(1, 'SMTP_USER is required'),
  SMTP_PASSWORD: z.string().min(1, 'SMTP_PASSWORD is required'),
  SMTP_FROM: z.string().email('SMTP_FROM must be a valid email address'),

  APP_URL: z.string().url('APP_URL must be a valid URL'),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters long'),

  SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  PAYMOB_PUBLIC_KEY: z.string().optional().or(z.literal('')),
  PAYMOB_SECRET_KEY: z.string().optional().or(z.literal('')),
  PAYMOB_API_KEY: z.string().optional().or(z.literal('')),
  PAYMOB_INTEGRATION_ID: z.string().optional().or(z.literal('')),
  TURNSTILE_SECRET_KEY: z.string().optional().or(z.literal('')),
  AUDIT_IP_SALT: z.string().optional().or(z.literal('')),
  STORAGE_DIR: z.string().min(1).optional().or(z.literal('')),
  FILE_URL_SECRET: z.string().min(16, 'FILE_URL_SECRET must be at least 16 characters long').optional().or(z.literal('')),
});

export type Env = z.infer<typeof envSchema>;

const parseEnv = (): Env => {
  if (process.env.BUILD_MODE === 'true') {
    return {} as Env;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    if (process.env.NODE_ENV === 'test') {
      return {} as Env;
    }

    console.error('❌ CRITICAL: Environment validation failed on boot!');
    console.error('The following environment variables are invalid or missing:');
    result.error.issues.forEach((issue) => {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });

    if (typeof process !== 'undefined') {
      process.exit(1);
    } else {
      throw new Error('Environment validation failed');
    }
  }

  return result.data;
};

export const env = parseEnv();
export default env;