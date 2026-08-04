/**
 * user preview â€” estimate shares for a deposit or assets for a redeem.
 *
 * Read-only. No signer key required.
 *
 * Required env: RPC_URL, VAULT_ADDRESS
 */

import type { Address } from "viem";
import { loadEnv } from "../../env";
import { makePublicClient } from "../../chain";
import { VAULT_ABI } from "../../abi";
import { log, label, c, err, formatUsdc, jsonOk, printJson } from "../../format";
import type { ParsedFlags } from "../../cli";
import { getApiConfig, apiUserPreview } from "../../api";

const HELP = `
user preview â€” Estimate deposit/redeem outcomes

USAGE
  wield user preview --deposit <usdc> | --redeem <shares>

REQUIRED ENV
  RPC_URL, VAULT_ADDRESS

FLAGS
  --deposit <usdc>   USDC amount to preview as deposit (human units)
  --redeem <shares>  Share amount to preview as redeem
  --json             Machine-readable output
  --help             Show this help

EXAMPLES
  wield user preview --deposit 100
  wield user preview --redeem 50 --json
`;

export default async function preview(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  const depositRaw = flags.raw.get("deposit");
  const redeemRaw = flags.raw.get("redeem");

  if (!depositRaw && !redeemRaw) {
    log(err("Provide --deposit <usdc> or --redeem <shares>"));
    process.exit(1);
  }
  if (depositRaw && redeemRaw) {
    log(err("Provide --deposit XOR --redeem, not both"));
    process.exit(1);
  }

  const apiConfig = getApiConfig(flags);

  if (apiConfig) {
    // API mode
    const data = await apiUserPreview(apiConfig, {
      deposit: depositRaw || undefined,
      shares: redeemRaw || undefined,
    });
    const d = data as Record<string, unknown>;
    if (flags.json) {
      printJson(jsonOk("user.preview", d), 0);
      return;
    }
    log("");
    log(c.bold(depositRaw ? "Deposit Preview (API)" : "Redeem Preview (API)"));
    log(label(`  Deposit: ${d.deposit ?? "â€”"}`));
    log(label(`  Shares: ${d.shares ?? "â€”"}`));
    log(label(`  Assets: ${d.assets ?? "â€”"}`));
    log("");
    return;
  }

  const env = loadEnv(["RPC_URL", "VAULT_ADDRESS"]);
  const pc = makePublicClient(env.RPC_URL!);
  const vault = env.VAULT_ADDRESS!;

  if (depositRaw) {
    const amount = parseUsdc(depositRaw);
    const shares = await pc.readContract({
      address: vault,
      abi: VAULT_ABI,
      functionName: "previewDeposit",
      args: [amount],
    }) as bigint;

    if (flags.json) {
      printJson(jsonOk("user.preview", {
        type: "deposit",
        assets: amount.toString(),
        shares: shares.toString(),
      }), 0);
      return;
    }

    log("");
    log(c.bold("Deposit Preview"));
    log(label(`  Deposit: ${formatUsdc(amount, 6)}`));
    log(label(`  â†’ Shares: ${shares.toLocaleString()}`));
    log("");
  } else {
    const shares = parseBigInt(redeemRaw!);
    const assets = await pc.readContract({
      address: vault,
      abi: VAULT_ABI,
      functionName: "previewRedeem",
      args: [shares],
    }) as bigint;

    if (flags.json) {
      printJson(jsonOk("user.preview", {
        type: "redeem",
        shares: shares.toString(),
        assets: assets.toString(),
      }), 0);
      return;
    }

    log("");
    log(c.bold("Redeem Preview"));
    log(label(`  Redeem: ${shares.toLocaleString()} shares`));
    log(label(`  â†’ Assets: ${formatUsdc(assets, 6)}`));
    log("");
  }
}

function parseUsdc(raw: string): bigint {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) {
    log(err(`Invalid USDC amount: ${raw}`));
    process.exit(1);
  }
  // USDC has 6 decimals
  const intPart = Math.floor(num);
  const fracPart = raw.includes(".") ? raw.split(".")[1].padEnd(6, "0").slice(0, 6) : "000000";
  return BigInt(intPart) * 10n ** 6n + BigInt(fracPart);
}

function parseBigInt(raw: string): bigint {
  const n = BigInt(raw);
  if (n <= 0n) {
    log(err(`Invalid amount: ${raw}`));
    process.exit(1);
  }
  return n;
}
