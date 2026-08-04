/**
 * env.ts — load and validate environment variables from cli/.env.
 *
 * Each command declares its required subset; loadEnv returns only those fields.
 * Reads .env file relative to this source file (cli/src/env.ts → cli/.env).
 * Never loads keys that weren't requested.
 */

import { isAddress, isHex, type Address, type Hex } from "viem";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---- types ----

export type EnvKey =
  | "RPC_URL"
  | "VAULT_ADDRESS"
  | "USDG_ADDRESS"
  | "AGENT_PRIVATE_KEY"
  | "USER_PRIVATE_KEY"
  | "UNDERLYING_1"
  | "UNDERLYING_2"
  | "DB_PATH";

type RequestedEnvKey = EnvKey | "USDC_ADDRESS";

export interface EnvConfig {
  RPC_URL?: string;
  VAULT_ADDRESS?: Address;
  USDG_ADDRESS?: Address;
  AGENT_PRIVATE_KEY?: Hex;
  USER_PRIVATE_KEY?: Hex;
  UNDERLYING_1?: Address;
  UNDERLYING_2?: Address;
  DB_PATH?: string;
}

type EnvConfigWithLegacy = EnvConfig & {
  USDC_ADDRESS?: Address;
};

export class EnvError extends Error {
  constructor(
    public readonly code: "ENV_MISSING" | "ENV_INVALID",
    public readonly detail: string,
  ) {
    super(detail);
    this.name = "EnvError";
  }
}

// ---- internal parser ----

function dotenvPath(): string {
  return join(import.meta.dir, "..", "..", ".env");
}

function parseDotenv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadDotenv(): Record<string, string> {
  try {
    const path = dotenvPath();
    const text = readFileSync(path, "utf-8");
    return parseDotenv(text);
  } catch {
    return {};
  }
}

// ---- public ----

/**
 * Load environment variables from cli/.env, returning only the fields listed
 * in `required`.  Throws EnvError on missing or invalid values.
 *
 * Process env vars override the .env file automatically.
 */
export function loadEnv(required: RequestedEnvKey[]): EnvConfigWithLegacy {
  const dotenv = loadDotenv();
  const rawVals: Record<string, string> = {};

  for (const key of required) {
    if (key === "USDC_ADDRESS") {
      rawVals[key] = process.env.USDG_ADDRESS ?? dotenv.USDG_ADDRESS ?? process.env.USDC_ADDRESS ?? dotenv.USDC_ADDRESS ?? "";
      continue;
    }

    rawVals[key] = process.env[key] ?? dotenv[key] ?? "";
  }

  const out: EnvConfigWithLegacy = {};

  for (const key of required) {
    const raw = rawVals[key];

    switch (key) {
      case "RPC_URL": {
        if (!raw) throw new EnvError("ENV_MISSING", `RPC_URL is required`);
        out.RPC_URL = raw;
        break;
      }
      case "VAULT_ADDRESS": {
        if (!raw) throw new EnvError("ENV_MISSING", `VAULT_ADDRESS is required`);
        if (!isAddress(raw)) throw new EnvError("ENV_INVALID", `VAULT_ADDRESS is not a valid address: ${raw}`);
        out.VAULT_ADDRESS = raw as Address;
        break;
      }
      case "USDG_ADDRESS": {
        if (!raw) throw new EnvError("ENV_MISSING", `USDG_ADDRESS is required`);
        if (!isAddress(raw)) throw new EnvError("ENV_INVALID", `USDG_ADDRESS is not a valid address: ${raw}`);
        out.USDG_ADDRESS = raw as Address;
        break;
      }
      case "USDC_ADDRESS": {
        if (!raw) throw new EnvError("ENV_MISSING", `USDG_ADDRESS is required`);
        if (!isAddress(raw)) throw new EnvError("ENV_INVALID", `USDG_ADDRESS is not a valid address: ${raw}`);
        out.USDG_ADDRESS = raw as Address;
        out.USDC_ADDRESS = raw as Address;
        break;
      }
      case "AGENT_PRIVATE_KEY": {
        if (!raw) throw new EnvError("ENV_MISSING", `AGENT_PRIVATE_KEY is required`);
        if (!isHex(raw) || raw.length !== 66) throw new EnvError("ENV_INVALID", `AGENT_PRIVATE_KEY must be 0x + 64 hex chars`);
        out.AGENT_PRIVATE_KEY = raw as Hex;
        break;
      }
      case "USER_PRIVATE_KEY": {
        if (!raw) throw new EnvError("ENV_MISSING", `USER_PRIVATE_KEY is required`);
        if (!isHex(raw) || raw.length !== 66) throw new EnvError("ENV_INVALID", `USER_PRIVATE_KEY must be 0x + 64 hex chars`);
        out.USER_PRIVATE_KEY = raw as Hex;
        break;
      }
      case "UNDERLYING_1": {
        if (!raw) throw new EnvError("ENV_MISSING", `UNDERLYING_1 is required`);
        if (!isAddress(raw)) throw new EnvError("ENV_INVALID", `UNDERLYING_1 is not a valid address: ${raw}`);
        out.UNDERLYING_1 = raw as Address;
        break;
      }
      case "UNDERLYING_2": {
        if (!raw) throw new EnvError("ENV_MISSING", `UNDERLYING_2 is required`);
        if (!isAddress(raw)) throw new EnvError("ENV_INVALID", `UNDERLYING_2 is not a valid address: ${raw}`);
        out.UNDERLYING_2 = raw as Address;
        break;
      }
      case "DB_PATH": {
        if (!raw) throw new EnvError("ENV_MISSING", `DB_PATH is required`);
        out.DB_PATH = raw;
        break;
      }
    }
  }

  return out;
}
