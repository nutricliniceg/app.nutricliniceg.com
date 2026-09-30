import type { AdapterCall, AdapterResult } from '../types';
import { postJson, withBackoff, ProviderHttpError } from './http';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_CONTINUATIONS = 2;

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

function toGeminiContents(text: string, images: Array<{ bytes: Uint8Array; mime: string }>): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = [{ text }];
  for (const img of images.slice(0, 4)) {
    parts.push({ inline_data: { mime_type: img.mime, data: Buffer.from(img.bytes).toString('base64') } });
  }
  return { role: 'user', parts };
}

export async function callGemini(call: AdapterCall): Promise<AdapterResult> {
  const system = call.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n') || undefined;
  const turns = call.messages.filter((m) => m.role !== 'system');
  let prompt = turns.map((m) => `${m.role === 'assistant' ? 'Model' : 'User'}: ${m.content}`).join('\n\n');
  let text = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let truncated = false;
  for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
    const url = `${GEMINI_API}/${encodeURIComponent(call.model)}:generateContent?key=${encodeURIComponent(call.apiKey)}`;
    const body: Record<string, unknown> = {
      contents: [toGeminiContents(prompt, (call.images ?? []).map((i) => ({ bytes: i.bytes, mime: i.mime })))],
      generationConfig: {
        maxOutputTokens: call.maxTokens,
        ...(call.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    };
    const { status, json } = await withBackoff(() => postJson(url, {}, body, call.timeoutMs));
    if (status < 200 || status >= 300) {
      throw new ProviderHttpError(status, (json as GeminiResponse)?.error?.message ?? 'Gemini call failed');
    }
    const res = json as GeminiResponse;
    if (res.error) throw new Error(res.error.message ?? 'Provider error');
    const candidate = res.candidates?.[0];
    const chunk = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    text += chunk;
    promptTokens += res.usageMetadata?.promptTokenCount ?? 0;
    completionTokens += res.usageMetadata?.candidatesTokenCount ?? 0;
    if (candidate?.finishReason === 'MAX_TOKENS' && round < MAX_CONTINUATIONS) {
      prompt = `${prompt}\n\nModel (so far): ${chunk}\n\nContinue exactly where you stopped. Do not repeat.`;
      continue;
    }
    truncated = candidate?.finishReason === 'MAX_TOKENS';
    break;
  }
  return { text, promptTokens, completionTokens, truncated };
}
