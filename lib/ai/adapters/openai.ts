import type { AdapterCall, AdapterResult, ChatMessage } from '../types';
import { postJson, withBackoff, ProviderHttpError } from './http';

const OPENAI_API = 'https://api.openai.com/v1/chat/completions';
const MAX_CONTINUATIONS = 2;

interface OpenAiChoice {
  message?: { content?: string | null };
  finish_reason?: string | null;
}

interface OpenAiResponse {
  choices?: OpenAiChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

function toOpenAiMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

async function singleCall(url: string, apiKey: string, model: string, messages: Array<{ role: string; content: string }>, maxTokens: number, timeoutMs: number, jsonMode: boolean): Promise<OpenAiResponse> {
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const { status, json } = await withBackoff(() =>
    postJson(url, { Authorization: `Bearer ${apiKey}` }, body, timeoutMs)
  );
  if (status < 200 || status >= 300) {
    throw new ProviderHttpError(status, (json as { error?: { message?: string } })?.error?.message ?? 'OpenAI-compatible call failed');
  }
  return json as OpenAiResponse;
}

// Shared OpenAI-compatible chat loop (used by OpenAI + Custom adapters):
// AI-06 — on `length` truncation, ask for continuation and concatenate.
export async function openAiCompatibleChat(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  timeoutMs: number,
  jsonMode: boolean
): Promise<AdapterResult> {
  let history = toOpenAiMessages(messages);
  let text = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let truncated = false;
  for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
    const res = await singleCall(url, apiKey, model, history, maxTokens, timeoutMs, jsonMode);
    if (res.error) throw new Error(res.error.message ?? 'Provider error');
    const choice = res.choices?.[0];
    const chunk = choice?.message?.content ?? '';
    text += chunk;
    promptTokens += res.usage?.prompt_tokens ?? 0;
    completionTokens += res.usage?.completion_tokens ?? 0;
    if (choice?.finish_reason === 'length' && round < MAX_CONTINUATIONS) {
      history = [...history, { role: 'assistant', content: chunk }, { role: 'user', content: 'Continue exactly where you stopped. Do not repeat.' }];
      truncated = false;
      continue;
    }
    truncated = choice?.finish_reason === 'length';
    break;
  }
  return { text, promptTokens, completionTokens, truncated };
}

export async function callOpenAi(call: AdapterCall): Promise<AdapterResult> {
  return openAiCompatibleChat(OPENAI_API, call.apiKey, call.model, call.messages, call.maxTokens, call.timeoutMs, call.jsonMode);
}

export async function callCustom(call: AdapterCall): Promise<AdapterResult> {
  const base = (call.baseUrl ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('Custom provider requires base_url');
  return openAiCompatibleChat(`${base}/chat/completions`, call.apiKey, call.model, call.messages, call.maxTokens, call.timeoutMs, call.jsonMode);
}
