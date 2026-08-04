/**
 * provider.ts — auto-detect LLM provider from .env, raw fetch() wrapper.
 *
 * ZERO LLM dependencies in package.json. Uses native fetch() for:
 *   OPENAI_API_KEY  → OpenAI  (gpt-4o-mini)
 *   ANTHROPIC_API_KEY → Anthropic (claude-3-5-haiku-latest)
 *   OLLAMA_HOST     → Ollama  (llama3.2, local)
 *
 * No API key → returns helpful message, CLI continues normally.
 */

import { log, warn, c } from "../format";

// ---- types ----

export type Provider = "openai" | "anthropic" | "ollama";

export interface LlmConfig {
  provider: Provider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

export class LlmError extends Error {
  constructor(
    public readonly code: "NO_PROVIDER" | "API_ERROR" | "TIMEOUT",
    detail: string,
  ) {
    super(detail);
    this.name = "LlmError";
  }
}

// ---- detection ----

const NO_PROVIDER_MSG = `
${warn("No LLM provider configured.")}

Set one of these environment variables in your .env file:

  OPENAI_API_KEY     →  OpenAI (gpt-4o-mini)
  ANTHROPIC_API_KEY  →  Anthropic (claude-3-5-haiku-latest)
  OLLAMA_HOST        →  Ollama local (llama3.2)

Examples:
  OPENAI_API_KEY=sk-...
  ANTHROPIC_API_KEY=sk-ant-...
  OLLAMA_HOST=http://localhost:11434
`;

/**
 * Auto-detect provider from environment. Returns null if none configured,
 * caller should print NO_PROVIDER_MSG and exit gracefully.
 */
export function detectProvider(): LlmConfig | null {
  // .env is already loaded by loadEnv() in each command — process.env populated
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
    };
  }
  if (process.env.OLLAMA_HOST) {
    const host = process.env.OLLAMA_HOST.replace(/\/+$/, "");
    return {
      provider: "ollama",
      baseUrl: host,
      model: process.env.OLLAMA_MODEL ?? "llama3.2",
    };
  }
  return null;
}

export function showNoProviderMessage(): void {
  log(NO_PROVIDER_MSG.trim());
}

// ---- fetch wrappers ----

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const FETCH_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: controller.signal });
    return r;
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new LlmError("TIMEOUT", `Request timed out after ${timeoutMs / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function openaiChat(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  const url = config.baseUrl
    ? `${config.baseUrl}/v1/chat/completions`
    : "https://api.openai.com/v1/chat/completions";

  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    }),
  }, FETCH_TIMEOUT_MS);

  const data = await r.json() as Record<string, unknown>;
  if (!r.ok) {
    throw new LlmError("API_ERROR", `OpenAI: ${(data as Record<string, unknown>).error ? JSON.stringify((data as Record<string, unknown>).error) : r.statusText}`);
  }
  const choices = data.choices as Array<{ message: { content: string } }>;
  return choices?.[0]?.message?.content ?? "";
}

async function anthropicChat(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  const url = config.baseUrl
    ? `${config.baseUrl}/v1/messages`
    : "https://api.anthropic.com/v1/messages";

  // Anthropic separates system from messages
  const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
  const userMsgs = messages.filter(m => m.role !== "system");

  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2048,
      system: systemMsg,
      messages: userMsgs.map(m => ({ role: m.role, content: m.content })),
    }),
  }, FETCH_TIMEOUT_MS);

  const data = await r.json() as Record<string, unknown>;
  if (!r.ok) {
    throw new LlmError("API_ERROR", `Anthropic: ${(data as Record<string, unknown>).error ? JSON.stringify((data as Record<string, unknown>).error) : r.statusText}`);
  }
  const content = data.content as Array<{ type: string; text: string }>;
  return content?.[0]?.text ?? "";
}

async function ollamaChat(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  const host = config.baseUrl ?? "http://localhost:11434";
  const url = `${host}/api/chat`;

  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
    }),
  }, FETCH_TIMEOUT_MS);

  const data = await r.json() as Record<string, unknown>;
  if (!r.ok) {
    throw new LlmError("API_ERROR", `Ollama: ${(data as Record<string, unknown>).error ?? r.statusText}`);
  }
  const msg = data.message as { content: string };
  return msg?.content ?? "";
}

// ---- public API ----

/**
 * Send a system + user prompt to the configured LLM and return the response.
 * @throws LlmError on network/API failures.
 */
export async function chat(config: LlmConfig, systemPrompt: string, userMessage: string): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  switch (config.provider) {
    case "openai":
      return openaiChat(config, messages);
    case "anthropic":
      return anthropicChat(config, messages);
    case "ollama":
      return ollamaChat(config, messages);
  }
}

/**
 * Print which provider and model is being used.
 */
export function providerLabel(config: LlmConfig): string {
  return `${config.provider} / ${config.model}`;
}
