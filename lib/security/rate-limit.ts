import { maintenanceRepository } from '@/lib/db/repositories/maintenance.repo';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const key = `${config.keyPrefix}:${identifier}`;
  const now = Date.now();

  if (config.windowMs <= 60000 && process.env.NODE_ENV !== 'test') {
    let entry = memoryStore.get(key);
    if (!entry || now - entry.windowStart >= config.windowMs) {
      entry = { count: 0, windowStart: now };
      memoryStore.set(key, entry);
    }
    entry.count++;
    const allowed = entry.count <= config.maxRequests;
    return { allowed, remaining: Math.max(0, config.maxRequests - entry.count), resetTime: entry.windowStart + config.windowMs };
  }

  const dbKey = key.replace(/:/g, '_');
  const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
  const windowEnd = windowStart + config.windowMs;

  try {
    const currentCount = await maintenanceRepository.rateLimitCount(dbKey, new Date(windowStart));
    if (currentCount >= config.maxRequests) {
      return { allowed: false, remaining: 0, resetTime: windowEnd };
    }

    await maintenanceRepository.rateLimitIncrement(dbKey, new Date(windowStart));

    return { allowed: true, remaining: config.maxRequests - currentCount - 1, resetTime: windowEnd };
  } catch {
    let entry = memoryStore.get(key);
    if (!entry || now - entry.windowStart >= config.windowMs) {
      entry = { count: 0, windowStart: now };
      memoryStore.set(key, entry);
    }
    entry.count++;
    return { allowed: entry.count <= config.maxRequests, remaining: Math.max(0, config.maxRequests - entry.count), resetTime: entry.windowStart + config.windowMs };
  }
}

export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 5, keyPrefix: 'auth' },
  ai: { windowMs: 60 * 60 * 1000, maxRequests: 100, keyPrefix: 'ai' },
  contact: { windowMs: 60 * 60 * 1000, maxRequests: 3, keyPrefix: 'contact' },
  newsletter: { windowMs: 60 * 60 * 1000, maxRequests: 5, keyPrefix: 'newsletter' },
  portalRead: { windowMs: 60 * 60 * 1000, maxRequests: 200, keyPrefix: 'portal-read' },
  portalWrite: { windowMs: 60 * 60 * 1000, maxRequests: 20, keyPrefix: 'portal-write' },
} as const;