/**
 * context.ts — gather on-chain and SQLite data for LLM prompts.
 *
 * Each gather* function collects relevant context from chain/DB for a specific
 * LLM command. Returns a plain object ready to be stringified into the prompt.
 */

import type { Address } from "viem";
import { makePublicClient } from "../chain";
import { VAULT_ABI } from "../abi";
import { openDecisionsRead } from "../db";
import { formatUsdc } from "../format";

// ---- vault state ----

export interface VaultContext {
  vault: string;
  totalAssets: string;
  totalAssetsUsd: string;
  totalSupply: string;
  paused: boolean;
  underlyings: string[];
  underlyingsCount: number;
}

export async function gatherVaultState(
  rpcUrl: string,
  vaultAddress: Address,
): Promise<VaultContext> {
  const pc = makePublicClient(rpcUrl);

  const [totalAssets, totalSupply, paused, underlyings] = await Promise.all([
    pc.readContract({ address: vaultAddress, abi: VAULT_ABI, functionName: "totalAssets" }),
    pc.readContract({ address: vaultAddress, abi: VAULT_ABI, functionName: "totalSupply" }),
    pc.readContract({ address: vaultAddress, abi: VAULT_ABI, functionName: "paused" }),
    pc.readContract({ address: vaultAddress, abi: VAULT_ABI, functionName: "getUnderlyings" }),
  ]);

  const ua = underlyings as string[];

  return {
    vault: vaultAddress,
    totalAssets: (totalAssets as bigint).toString(),
    totalAssetsUsd: formatUsdc(totalAssets as bigint, 6),
    totalSupply: (totalSupply as bigint).toString(),
    paused: paused as boolean,
    underlyings: ua,
    underlyingsCount: ua.length,
  };
}

// ---- decision rows ----

export interface DecisionRow {
  id: number;
  ts: string;
  intent_hash: string;
  nonce: number;
  allocations_json: string;
  tx_hash: string | null;
  status: string;
  error_msg: string | null;
}

export function gatherRecentDecisions(dbPath: string, limit = 10): DecisionRow[] {
  try {
    const db = openDecisionsRead(dbPath);
    const rows = db
      .query("SELECT * FROM decisions ORDER BY id DESC LIMIT ?")
      .all(limit) as DecisionRow[];
    return rows;
  } catch {
    return [];
  }
}

export function gatherDecisionById(dbPath: string, id: number): DecisionRow | null {
  try {
    const db = openDecisionsRead(dbPath);
    const row = db
      .query("SELECT * FROM decisions WHERE id = ?")
      .get(id) as DecisionRow | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

// ---- composite contexts ----

export interface AnalyzeContext {
  vault: VaultContext;
  recentDecisions: DecisionRow[];
}

export async function gatherAnalyzeContext(
  rpcUrl: string,
  vaultAddress: Address,
  dbPath?: string,
): Promise<AnalyzeContext> {
  const vault = await gatherVaultState(rpcUrl, vaultAddress);
  const recentDecisions = dbPath ? gatherRecentDecisions(dbPath, 10) : [];
  return { vault, recentDecisions };
}

export interface ExplainContext {
  decision: DecisionRow;
  vault: VaultContext;
}

export async function gatherExplainContext(
  rpcUrl: string,
  vaultAddress: Address,
  dbPath: string,
  decisionId: number,
): Promise<ExplainContext> {
  const [vault, decision] = await Promise.all([
    gatherVaultState(rpcUrl, vaultAddress),
    Promise.resolve(gatherDecisionById(dbPath, decisionId)),
  ]);

  if (!decision) {
    throw new Error(`Decision #${decisionId} not found in database`);
  }

  return { vault, decision };
}

export interface SuggestContext {
  vault: VaultContext;
  recentDecisions: DecisionRow[];
}

export async function gatherSuggestContext(
  rpcUrl: string,
  vaultAddress: Address,
  dbPath?: string,
): Promise<SuggestContext> {
  const vault = await gatherVaultState(rpcUrl, vaultAddress);
  const recentDecisions = dbPath ? gatherRecentDecisions(dbPath, 10) : [];
  return { vault, recentDecisions };
}
