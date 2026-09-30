import type { AdapterCall, AdapterResult } from '../types';
import { postJson, withBackoff, ProviderHttpError } from './http';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_CONTINUATIONS = 2;

interface AnthropicBlock {
  type?: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicBlock[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export async function callAnthropic(call: AdapterCall): Promise<AdapterResult> {
  const system = call.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n') || undefined;
  const turns = call.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  let text = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let truncated = false;
  let history = turns;
  for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
    const { status, json } = await withBackoff(() =>
      postJson(
        ANTHROPIC_API,
        { 'x-api-key': call.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
        { model: call.model, max_tokens: call.maxTokens, ...(system ? { system } : {}), messages: history },
        call.timeoutMs
      )
    );
    if (status < 200 || status >= 300) {
      throw new ProviderHttpError(status, (json as AnthropicResponse)?.error?.message ?? 'Anthropic call failed');
    }
    const res = json as AnthropicResponse;
    if (res.error) throw new Error(res.error.message ?? 'Provider error');
    const chunk = (res.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    text += chunk;
    promptTokens += res.usage?.input_tokens ?? 0;
    completionTokens += res.usage?.output_tokens ?? 0;
    if (res.stop_reason === 'max_tokens' && round < MAX_CONTINUATIONS) {
      history = [...history, { role: 'assistant', content: chunk }, { role: 'user', content: 'Continue exactly where you stopped. Do not repeat.' }];
      continue;
    }
    truncated = res.stop_reason === 'max_tokens';
    break;
  }
  return { text, promptTokens, completionTokens, truncated };
}
