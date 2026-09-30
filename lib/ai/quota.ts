import { settingsRepository } from '@/lib/db/repositories/settings.repo';
import { aiUsageRepository, type MonthlyUsage } from '@/lib/db/repositories/ai.repo';

// AI-11: per-doctor monthly quota. Caps resolve plan-first
// (SubscriptionPlan.max_ai_calls_monthly), else SystemSettings
// `ai.quota.defaults`. Admins bypass via the isAdmin flag at call time.
export interface QuotaCaps {
  calls: number;
  tokens: number;
  cost: number;
}

export interface QuotaVerdict {
  allowed: boolean;
  warn: boolean;
  usage: MonthlyUsage;
  caps: QuotaCaps;
  message: string | null;
}

const DEFAULT_CAPS: QuotaCaps = { calls: 200, tokens: 500_000, cost: 5 };

export const QUOTA_STOP_MESSAGE =
  'بلغت حد الاستخدام الشهري للذكاء الاصطناعي — يرجى ترقية خطتك أو التواصل مع الإدارة | Monthly AI quota reached — please upgrade your plan or contact support.';

export async function getQuotaCaps(doctorId: string): Promise<QuotaCaps> {
  let caps = { ...DEFAULT_CAPS };
  try {
    const configured = await settingsRepository.get<Partial<QuotaCaps>>('ai.quota.defaults');
    if (configured && typeof configured === 'object') {
      caps = {
        calls: Number(configured.calls) > 0 ? Number(configured.calls) : caps.calls,
        tokens: Number(configured.tokens) > 0 ? Number(configured.tokens) : caps.tokens,
        cost: Number(configured.cost) > 0 ? Number(configured.cost) : caps.cost,
      };
    }
  } catch {
    // Settings unavailable — baked-in defaults apply.
  }
  try {
    const planCap = await aiUsageRepository.planCallCap(doctorId);
    if (planCap !== null && planCap > 0) caps.calls = planCap;
  } catch {
    // Plan lookup unavailable — keep resolved caps.
  }
  return caps;
}

export function judgeQuota(usage: MonthlyUsage, caps: QuotaCaps): Omit<QuotaVerdict, 'usage' | 'caps'> {
  const over =
    usage.calls >= caps.calls || usage.tokens >= caps.tokens || usage.cost >= caps.cost;
  if (over) return { allowed: false, warn: true, message: QUOTA_STOP_MESSAGE };
  const ratio = Math.max(usage.calls / caps.calls, usage.tokens / caps.tokens, usage.cost / caps.cost);
  if (ratio >= 0.8) {
    return {
      allowed: true,
      warn: true,
      message:
        'اقتربت من حد الاستخدام الشهري (80%) — راجع خطتك | You have used 80% of your monthly AI quota.',
    };
  }
  return { allowed: true, warn: false, message: null };
}

export async function checkQuota(doctorId: string): Promise<QuotaVerdict> {
  const [caps, usage] = await Promise.all([getQuotaCaps(doctorId), aiUsageRepository.monthlyForDoctor(doctorId)]);
  const verdict = judgeQuota(usage, caps);
  return { ...verdict, usage, caps };
}
