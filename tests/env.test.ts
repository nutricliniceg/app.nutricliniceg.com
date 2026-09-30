import { describe, it, expect } from 'vitest';
import { envSchema } from '@/lib/env';

const validEnvData = {
  NODE_ENV: 'development',
  APP_URL: 'https://nutricliniceg.com',
  JWT_SECRET: 'not real just words for testing only change me',
  ENCRYPTION_KEY: 'not real just words for testing only change me',
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '3306',
  DATABASE_USER: 'nutri_user',
  DATABASE_PASSWORD: 'nutri_password',
  DATABASE_NAME: 'nutricliniceg_db',
  SMTP_HOST: 'mail.nutricliniceg.com',
  SMTP_PORT: '465',
  SMTP_USER: 'info@nutricliniceg.com',
  SMTP_PASSWORD: 'smtp_password_goes_here',
  SMTP_FROM: 'info@nutricliniceg.com',
  CRON_SECRET: 'not real change me use your own value',
};

describe('Environment Variables Schema Validation', () => {
  it('should accept a fully valid environment config', () => {
    const result = envSchema.safeParse(validEnvData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_PORT).toBe(3306);
      expect(result.data.SMTP_PORT).toBe(465);
    }
  });

  it('should reject a JWT_SECRET shorter than 32 characters', () => {
    const invalidData = {
      ...validEnvData,
      JWT_SECRET: 'too-short-jwt-secret',
    };
    const result = envSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some(i => i.path.includes('JWT_SECRET'))).toBe(true);
    }
  });

  it('should reject an ENCRYPTION_KEY shorter than 32 characters', () => {
    const invalidData = {
      ...validEnvData,
      ENCRYPTION_KEY: 'short-key',
    };
    const result = envSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some(i => i.path.includes('ENCRYPTION_KEY'))).toBe(true);
    }
  });

  it('should reject invalid SMTP_FROM email format', () => {
    const invalidData = {
      ...validEnvData,
      SMTP_FROM: 'not-an-email',
    };
    const result = envSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some(i => i.path.includes('SMTP_FROM'))).toBe(true);
    }
  });

  it('should reject invalid APP_URL format', () => {
    const invalidData = {
      ...validEnvData,
      APP_URL: 'invalid-url',
    };
    const result = envSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some(i => i.path.includes('APP_URL'))).toBe(true);
    }
  });

  it('should reject a CRON_SECRET shorter than 16 characters', () => {
    const invalidData = {
      ...validEnvData,
      CRON_SECRET: 'short-cron',
    };
    const result = envSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some(i => i.path.includes('CRON_SECRET'))).toBe(true);
    }
  });
});
