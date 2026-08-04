/**
 * api.ts â€” HTTP client for CLI-to-API communication.
 *
 * When --api-key is provided, CLI becomes a thin client: reads go through
 * the API, and writes are signed locally then broadcast via the API.
 */
import { log, label, c, err, jsonErr, printJson } from "./format";
import type { ParsedFlags } from "./cli";

export interface ApiConfig {
  key: string;
  url: string;
}

/** Extract API config from parsed flags. Returns null if no --api-key set. */
export function getApiConfig(flags: ParsedFlags): ApiConfig | null {
  if (!flags.apiKey) return null;
  return {
    key: flags.apiKey,
    url: flags.apiUrl ?? "https://app.usewield.io",
  };
}

async function fetchApi(
  config: ApiConfig,
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<unknown> {
  const url = `${config.url}${path}`;
  const headers: Record<string, string> = {
    "X-API-Key": config.key,
    "Content-Type": "application/json",
  };
  const r = await fetch(url, {
    method: opts?.method ?? "GET",
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = (data as Record<string, unknown>)?.error ?? `HTTP ${r.status}`;
    throw new Error(String(msg));
  }
  return data;
}

// ---- Agent commands ----

export async function apiAgentStatus(config: ApiConfig): Promise<Record<string, unknown>> {
  return fetchApi(config, "/api/cli/agent/status") as Promise<Record<string, unknown>>;
}

export async function apiAgentDecisions(
  config: ApiConfig,
  limit?: number,
  status?: string,
): Promise<unknown[]> {
  const qs = new URLSearchParams();
  if (limit) qs.set("limit", String(limit));
  if (status) qs.set("status", status);
  const q = qs.toString();
  return fetchApi(config, `/api/cli/agent/decisions${q ? `?${q}` : ""}`) as Promise<unknown[]>;
}

export async function apiAgentTick(config: ApiConfig, signedTx: string): Promise<Record<string, unknown>> {
  return fetchApi(config, "/api/cli/agent/tick", {
    method: "POST",
    body: { signedTx },
  }) as Promise<Record<string, unknown>>;
}

// ---- User commands ----

export async function apiUserPreview(
  config: ApiConfig,
  params: { deposit?: string; shares?: string },
): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams();
  if (params.deposit) qs.set("deposit", params.deposit);
  if (params.shares) qs.set("shares", params.shares);
  return fetchApi(config, `/api/cli/user/preview?${qs}`) as Promise<Record<string, unknown>>;
}

export async function apiUserBalance(
  config: ApiConfig,
  address?: string,
): Promise<Record<string, unknown>> {
  const qs = address ? `?address=${address}` : "";
  return fetchApi(config, `/api/cli/user/balance${qs}`) as Promise<Record<string, unknown>>;
}

export async function apiUserApprove(config: ApiConfig, signedTx: string): Promise<Record<string, unknown>> {
  return fetchApi(config, "/api/cli/user/approve", {
    method: "POST",
    body: { signedTx },
  }) as Promise<Record<string, unknown>>;
}

export async function apiUserDeposit(config: ApiConfig, signedTx: string): Promise<Record<string, unknown>> {
  return fetchApi(config, "/api/cli/user/deposit", {
    method: "POST",
    body: { signedTx },
  }) as Promise<Record<string, unknown>>;
}

export async function apiUserWithdraw(config: ApiConfig, signedTx: string): Promise<Record<string, unknown>> {
  return fetchApi(config, "/api/cli/user/withdraw", {
    method: "POST",
    body: { signedTx },
  }) as Promise<Record<string, unknown>>;
}
