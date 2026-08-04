/**
 * agent status - show vault state, agent identity, and last decision summary.
 *
 * Required env: RPC_URL, VAULT_ADDRESS
 * Optional env: DB_PATH (for last-decision row)
 */

import { type Address } from "viem";
import { loadEnv, type EnvConfig } from "../../env";
import { makePublicClient } from "../../chain";
import { VAULT_ABI } from "../../abi";
import { log, label, c, ok, warn, err, formatUsdc, formatBps, truncateAddress, table, jsonOk, printJson } from "../../format";
import type { ParsedFlags } from "../../cli";
import { getApiConfig, apiAgentStatus } from "../../api";

const HELP = `
agent status - Vault snapshot

USAGE
  wield agent status [flags]

REQUIRED ENV
  RPC_URL, VAULT_ADDRESS

FLAGS
  --json       Machine-readable output
  --help       Show this help

DESCRIPTION
  Reads vault state from chain: total assets, total supply, paused flag,
  agent identity, whitelisted underlyings, next nonce.  If DB_PATH is set
  in .env, also shows the most recent decision from the agent log.
`;

export default async function status(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  const apiConfig = getApiConfig(flags);

  if (apiConfig) {
    // API mode: fetch from server
    const data = await apiAgentStatus(apiConfig);
    renderStatus(data as Record<string, unknown>, flags);
    return;
  }

  const env = loadEnv(["RPC_URL", "VAULT_ADDRESS"]);
  const pc = makePublicClient(env.RPC_URL!);

  const vault = env.VAULT_ADDRESS!;

  // Batch reads
  const qs = [
    pc.readContract({ address: vault, abi: VAULT_ABI, functionName: "totalAssets" }),
    pc.readContract({ address: vault, abi: VAULT_ABI, functionName: "totalSupply" }),
    pc.readContract({ address: vault, abi: VAULT_ABI, functionName: "paused" }),
    pc.readContract({ address: vault, abi: VAULT_ABI, functionName: "agentDid" }),
    pc.readContract({ address: vault, abi: VAULT_ABI, functionName: "owner" }),
    pc.readContract({ address: vault, abi: VAULT_ABI, functionName: "getUnderlyings" }),
    pc.readContract({ address: vault, abi: VAULT_ABI, functionName: "nextNonce" }),
  ] as const;

  const [totalAssets, totalSupply, paused, agentDid, owner, underlyings, nextNonceVal] = await Promise.all(qs);

  renderStatus({
    vault,
    totalAssets: totalAssets.toString(),
    totalSupply: totalSupply.toString(),
    paused,
    agentDid: agentDid as string,
    owner: owner as string,
    underlyings: underlyings as string[],
    nextNonce: (nextNonceVal as bigint).toString(),
  }, flags);
}

function renderStatus(
  data: Record<string, unknown>,
  flags: ParsedFlags,
): void {
  const vault = data.vault as string;
  const totalAssets = data.totalAssets as string;
  const totalSupply = data.totalSupply as string;
  const paused = data.paused as boolean;
  const agentDid = data.agentDid as string;
  const owner = data.owner as string;
  const underlyings = (data.underlyings as string[]) ?? [];
  const nextNonce = data.nextNonce as string;

  if (flags.json) {
    printJson(jsonOk("agent.status", {
      vault,
      totalAssets,
      totalSupply,
      paused,
      agentDid,
      owner,
      underlyings,
      nextNonce,
    }), 0);
    return;
  }

  // Pretty output
  log("");
  log(`  ${c.bold("Wield Vault")}  ${label(vault)}`);
  log(`  ${c.dim("-")}`);

  const statusColor = paused ? err : ok;
  log(`  Status:       ${statusColor(paused ? "PAUSED" : "ACTIVE")}`);
  log(`  Owner:        ${truncateAddress(owner)}`);
  log(`  Agent:        ${truncateAddress(agentDid)}`);
  log(`  Next Nonce:   ${nextNonce}`);
  log("");

  log(`  TVL:          ${formatUsdc(BigInt(totalAssets), 6)}`);
  log(`  Supply:       ${BigInt(totalSupply).toLocaleString()} shares`);
  log("");

  // Underlyings table
  if (underlyings.length > 0) {
    table(
      ["#", "Underlying"],
      underlyings.map((a, i) => [String(i + 1), a]),
    );
  } else {
    log(`  ${warn("No underlyings whitelisted.")}`);
  }
  log("");
}
