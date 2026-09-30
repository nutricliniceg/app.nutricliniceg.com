import type {
  AiClient,
  AnonymizedPatientContext,
  ChatMessage,
  ChatOptions,
  ChatResult,
  LabItem,
  VisionOptions,
} from './types';
import { estimateTokens } from './usage';

const LAB_LINE = /^\s*([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF .()-]{1,60})[:=\-–]\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z/%μµ]*)\s*$/;

export function parseLabText(text: string): LabItem[] {
  const items: LabItem[] = [];
  for (const line of text.slice(0, 8000).split('\n')) {
    const m = LAB_LINE.exec(line.trim());
    if (!m) continue;
    const value = Number(m[2]);
    if (!Number.isFinite(value)) continue;
    items.push({ name: m[1].trim().slice(0, 120), value, unit: m[3]?.slice(0, 20) || null });
    if (items.length >= 50) break;
  }
  return items;
}

// Deterministic offline adapter (dev/test + chain fallback when no provider
// is configured). Never touches the network or the key vault.
export class MockAiClient implements AiClient {
  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
    const last = messages.filter((m) => m.role === 'user').pop()?.content ?? '';
    const text = `Mock reply to: ${last.slice(0, 200)}`;
    return {
      text,
      promptTokens: estimateTokens(messages.map((m) => m.content).join('\n')),
      completionTokens: estimateTokens(text),
      model: opts?.model ?? 'mock',
      truncated: false,
    };
  }

  async chatJson<T>(messages: ChatMessage[], schema: { parse: (v: unknown) => T }, opts?: ChatOptions): Promise<T> {
    const last = messages.filter((m) => m.role === 'user').pop()?.content ?? '';
    const lines = last.split('\n').map((l) => l.trim()).filter(Boolean);
    const candidate: Record<string, unknown> = { echo: lines.slice(0, 10) };
    void opts;
    try {
      return schema.parse(candidate);
    } catch {
      return schema.parse({});
    }
  }

  async vision(imageBytes: Uint8Array, prompt: string, opts?: VisionOptions): Promise<ChatResult> {
    void imageBytes;
    void prompt;
    const text = 'Mock vision: no analyzable values detected.';
    return {
      text,
      promptTokens: estimateTokens(prompt) + 100,
      completionTokens: estimateTokens(text),
      model: opts?.model ?? 'mock-vision',
      truncated: false,
    };
  }

  async summarizePatient(ctx: AnonymizedPatientContext): Promise<string> {
    const trend = ctx.weightTrendKg.length > 1
      ? ctx.weightTrendKg[ctx.weightTrendKg.length - 1] - ctx.weightTrendKg[0]
      : 0;
    const direction = trend < 0 ? 'losing weight' : trend > 0 ? 'gaining weight' : 'weight stable';
    return [
      `Patient (${ctx.age}y, ${ctx.gender}, BMI ${ctx.bmi}) is ${direction} (Δ ${trend.toFixed(1)} kg).`,
      `Goal: ${ctx.goal}; activity: ${ctx.activityLevel}.`,
      ctx.chronicFlags.length > 0 ? `Flags: ${ctx.chronicFlags.join('; ')}.` : 'No chronic flags.',
      'Review the latest visit and confirm targets before adjusting the plan.',
    ].join(' ');
  }

  async extractLabValues(input: { imageBytes?: Uint8Array; mime?: string; text?: string }): Promise<LabItem[]> {
    if (input.text) return parseLabText(input.text);
    return [];
  }
}
