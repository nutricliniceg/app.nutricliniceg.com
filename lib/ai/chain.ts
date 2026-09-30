import { randomUUID } from 'crypto';
import type {
  AdapterFn,
  AiClient,
  AiProviderType,
  AnonymizedPatientContext,
  ChatMessage,
  ChatOptions,
  ChatResult,
  LabItem,
  VisionOptions,
} from './types';
import { callOpenAi, callCustom } from './adapters/openai';
import { callGemini } from './adapters/gemini';
import { callAnthropic } from './adapters/anthropic';
import { aiProviderRepository } from '@/lib/db/repositories/ai.repo';
import { getPriceTable } from './pricing';
import { checkQuota, QUOTA_STOP_MESSAGE } from './quota';
import { enqueueRetryRequest } from './retry-queue';
import { fencePatientData, sanitizeUntrusted } from './sanitize';
import { tryParseJson, coerceLabItems } from './json';
import { attemptProvider } from './attempt';
import { notificationService } from '@/lib/notifications/service';
import { serviceFail as fail } from '@/lib/errors/fail';
import { MEDICAL_DISCLAIMER } from './disclaimer';

export const CHAIN_DEGRADED_MESSAGE =
  'تعذّر الوصول لخدمة الذكاء الاصطناعي حاليًا — تم حفظ طلبك وسنعيد المحاولة تلقائيًا | AI service temporarily unavailable — your request was queued and will be retried automatically.';

// Overridable in tests to simulate provider failures without network.
export const adapterRegistry: Record<AiProviderType, AdapterFn> = {
  openai: callOpenAi,
  gemini: callGemini,
  anthropic: callAnthropic,
  custom: callCustom,
};

export function chainErrorCode(err: unknown): string {
  return (err as { code?: string }).code ?? 'AI_ERROR';
}

export interface ChainOptions {
  doctorId: string | null;
  isAdmin?: boolean;
  requestType?: string;
  // CMP-10: set when the payload carries patient data. The chain then
  // requires at least one usable provider with a recorded non-'unknown'
  // retention posture, otherwise it fails closed (RETENTION_UNKNOWN).
  patientData?: boolean;
}

export class ChainAiClient implements AiClient {
  private doctorId: string | null;
  private isAdmin: boolean;
  private requestType: string;
  private patientData: boolean;

  constructor(opts: ChainOptions) {
    this.doctorId = opts.doctorId;
    this.isAdmin = opts.isAdmin ?? false;
    this.requestType = opts.requestType ?? 'chat';
    this.patientData = opts.patientData ?? false;
  }

  private async ensureQuota(): Promise<void> {
    if (this.isAdmin || !this.doctorId) return;
    const verdict = await checkQuota(this.doctorId);
    if (!verdict.allowed) throw fail('QUOTA_EXCEEDED', verdict.message ?? QUOTA_STOP_MESSAGE);
    if (verdict.warn && verdict.message) {
      try {
        await notificationService.notify({
          userId: this.doctorId,
          title: 'تنبيه حد الذكاء الاصطناعي',
          body: verdict.message,
          type: 'system',
        });
      } catch {
        // Quota warnings must never block the clinical path.
      }
    }
  }

  private async run(messages: ChatMessage[], opts: ChatOptions, images?: Array<{ bytes: Uint8Array; mime: string }>): Promise<ChatResult> {
    await this.ensureQuota();
    const providers = await aiProviderRepository.listChain();
    const now = Date.now();
    const usable = providers.filter((p) => !p.disabled_until || p.disabled_until.getTime() <= now);
    if (usable.length === 0) {
      await this.degrade(opts.requestType ?? this.requestType, { messages: clipped(messages) });
      throw fail('AI_UNAVAILABLE', CHAIN_DEGRADED_MESSAGE);
    }
    // CMP-10 fail-closed: patient data must never flow to a provider whose
    // retention posture is unrecorded — unless no compliant provider exists
    // at all AND the admin explicitly runs in mock/bypass... no: block.
    if (this.patientData && usable.every((p) => p.data_retention === 'unknown')) {
      throw fail(
        'RETENTION_UNKNOWN',
        'لا يمكن إرسال بيانات المريض: لم يتم توثيق سياسة الاحتفاظ بالبيانات لأي مزوّد مفعّل. وثّقها من لوحة الأدمن. | Patient data blocked: no enabled provider has a recorded data-retention posture.'
      );
    }
    const priceTable = await getPriceTable();
    const errors: string[] = [];
    for (const provider of usable) {
      if (images && images.length > 0 && !provider.supports_vision) continue;
      if (!adapterRegistry[provider.type]) {
        errors.push(`${provider.name}: no adapter`);
        continue;
      }
      try {
        const attempt = await attemptProvider(provider, messages, opts, images ?? [], {
          doctorId: this.doctorId,
          requestType: opts.requestType ?? this.requestType,
          priceTable,
          adapter: adapterRegistry[provider.type],
        });
        return attempt.result;
      } catch (err) {
        errors.push(`${provider.name}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }
    await this.degrade(opts.requestType ?? this.requestType, { messages: clipped(messages) });
    throw fail('AI_UNAVAILABLE', `${CHAIN_DEGRADED_MESSAGE} (${errors.slice(0, 2).join(' | ').slice(0, 300)})`);
  }

  private async degrade(requestType: string, payload: unknown): Promise<void> {
    try {
      await enqueueRetryRequest(randomUUID(), this.doctorId, requestType, payload);
    } catch {
      // Queue write failure degrades silently; the user-facing error still throws.
    }
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    const result = await this.run(messages, { ...opts, requestType: opts.requestType ?? 'chat' });
    return { ...result, text: `${result.text}\n\n${MEDICAL_DISCLAIMER}` };
  }

  // AI-07: parse, and on failure retry once with a repair nudge.
  async chatJson<T>(messages: ChatMessage[], schema: { parse: (v: unknown) => T }, opts: ChatOptions = {}): Promise<T & { _disclaimer: string }> {
    const jsonNudge: ChatMessage = { role: 'system', content: 'Respond with a single valid JSON object only. No prose, no markdown fences.' };
    const first = await this.run([jsonNudge, ...messages], { ...opts, requestType: opts.requestType ?? 'chat_json' });
    const parsed = tryParseJson(first.text);
    if (parsed.ok) {
      try {
        return { ...(schema.parse(parsed.value) as object), _disclaimer: MEDICAL_DISCLAIMER } as T & { _disclaimer: string };
      } catch {
        // Falls through to the repair attempt below.
      }
    }
    const repair = await this.run(
      [...messages, { role: 'assistant', content: first.text }, { role: 'user', content: 'That was not valid JSON matching the required schema. Reply again with ONLY the corrected JSON object.' }],
      { ...opts, requestType: opts.requestType ?? 'chat_json' }
    );
    const second = tryParseJson(repair.text);
    if (!second.ok) throw fail('AI_BAD_JSON', 'The AI response was not valid JSON after a repair attempt.');
    try {
      return { ...(schema.parse(second.value) as object), _disclaimer: MEDICAL_DISCLAIMER } as T & { _disclaimer: string };
    } catch {
      throw fail('AI_SCHEMA_MISMATCH', 'The AI response did not match the required schema.');
    }
  }

  async vision(imageBytes: Uint8Array, prompt: string, opts: VisionOptions = {}): Promise<ChatResult> {
    const result = await this.run(
      [{ role: 'user', content: prompt }],
      { ...opts, requestType: opts.requestType ?? 'vision' },
      [{ bytes: imageBytes, mime: opts.mime ?? 'image/jpeg' }]
    );
    return { ...result, text: `${result.text}\n\n${MEDICAL_DISCLAIMER}` };
  }

  async summarizePatient(ctx: AnonymizedPatientContext): Promise<string> {
    const res = await this.chat(
      [
        { role: 'system', content: 'You are a clinical documentation assistant for nutrition doctors. Summarize the anonymized patient context in 3-5 short sentences (Arabic first, then one English line). Suggestive only — never diagnose, never prescribe. End with: review required.' },
        { role: 'user', content: fencePatientData(`age=${ctx.age} gender=${ctx.gender} bmi=${ctx.bmi} weight=${ctx.currentWeightKg} trend=[${ctx.weightTrendKg.join(',')}] goal=${ctx.goal} activity=${ctx.activityLevel} flags=${ctx.chronicFlags.join(';')}`) },
      ],
      { requestType: 'summary', maxTokens: 600 }
    );
    return res.text;
  }

  async extractLabValues(input: { imageBytes?: Uint8Array; mime?: string; text?: string }): Promise<LabItem[]> {
    if (input.text) {
      const lines = sanitizeUntrusted(input.text).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 50).join('\n');
      const res = await this.chat(
        [
          { role: 'system', content: 'Extract lab test values. Reply with a JSON array only: [{"name": string, "value": number, "unit": string|null}].' },
          { role: 'user', content: fencePatientData(lines) },
        ],
        { requestType: 'lab_text', maxTokens: 1500 }
      );
      const parsed = tryParseJson(stripDisclaimer(res.text));
      return coerceLabItems(parsed.ok ? parsed.value : null);
    }
    if (input.imageBytes) {
      const res = await this.vision(
        input.imageBytes,
        'Extract every lab test value visible in this image. Reply with a JSON array only: [{"name": string, "value": number, "unit": string|null}].',
        { mime: input.mime, requestType: 'lab_vision', maxTokens: 1500 }
      );
      const parsed = tryParseJson(stripDisclaimer(res.text));
      return coerceLabItems(parsed.ok ? parsed.value : null);
    }
    return [];
  }
}

function clipped(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
}

function stripDisclaimer(text: string): string {
  const idx = text.lastIndexOf('\n\n');
  return idx > 0 ? text.slice(0, idx) : text;
}
