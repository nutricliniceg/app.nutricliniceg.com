import type { AiProviderType } from '@/lib/db/repositories/ai.repo';

export type { AiProviderType };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  requestType?: string;
}

export interface ChatResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  truncated: boolean;
}

export interface VisionOptions extends ChatOptions {
  mime?: string;
}

export interface LabItem {
  name: string;
  value: number;
  unit?: string | null;
}

export interface AnonymizedPatientContext {
  age: number;
  gender: 'male' | 'female';
  bmi: number;
  currentWeightKg: number;
  weightTrendKg: number[];
  goal: string;
  activityLevel: string;
  chronicFlags: string[];
}

// P12 core contract (§5.4, AI-05..07): every adapter + the chain + the mock
// implement this. High-level helpers (summarize/extract) are first-class so
// P10 callers keep working while routing through chain + quota.
export interface AiClient {
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
  chatJson<T>(messages: ChatMessage[], schema: { parse: (v: unknown) => T }, opts?: ChatOptions): Promise<T>;
  vision(imageBytes: Uint8Array, prompt: string, opts?: VisionOptions): Promise<ChatResult>;
  summarizePatient(ctx: AnonymizedPatientContext): Promise<string>;
  extractLabValues(input: { imageBytes?: Uint8Array; mime?: string; text?: string }): Promise<LabItem[]>;
}

export interface AdapterCall {
  providerType: AiProviderType;
  baseUrl: string | null;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  images?: Array<{ bytes: Uint8Array; mime: string }>;
  maxTokens: number;
  timeoutMs: number;
  jsonMode: boolean;
}

export interface AdapterResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  truncated: boolean;
}

export type AdapterFn = (call: AdapterCall) => Promise<AdapterResult>;

export const DEFAULT_MODEL: Record<AiProviderType, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-3-5-haiku-latest',
  custom: 'default',
};
