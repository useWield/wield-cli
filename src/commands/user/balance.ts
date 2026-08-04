/**
 * user balance - show USDC balance, vault share balance, and redeemable assets.
 *
 * Requires USER_PRIVATE_KEY or --address flag to identify the account.
 *
 * Required env: RPC_URL, VAULT_ADDRESS, USDC_ADDRESS
 * Optional: USER_PRIVATE_KEY (if --address not provided)
 */

import type { Address } from "viem";
import { loadEnv } from "../../env";
import { makePublicClient, senderAddress } from "../../chain";
import { VAULT_ABI, USDC_ABI } from "../../abi";
import { log, label, c, err, formatUsdc, jsonOk, printJson, table } from "../../format";
import type { ParsedFlags } from "../../cli";
import { getApiConfig, apiUserBalance } from "../../api";

const HELP = `
user balance - Show balances for a vault user

USAGE
  wield user balance [flags]

REQUIRED ENV
  RPC_URL, VAULT_ADDRESS, USDC_ADDRESS
  USER_PRIVATE_KEY  (unless --address is provided)

FLAGS
  --address <addr>  Query balances for a specific address (no key needed)
  --json            Machine-readable output
  --help            Show this help

DESCRIPTION
  Reads USDC balance, vault share balance, and redeemable asset value
  from the configured vault.
`;

export default async function balance(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  const apiConfig = getApiConfig(flags);

  if (apiConfig) {
    // API mode
    const addr = flags.raw.get("address") || undefined;
    const data = await apiUserBalance(apiConfig, addr) as Record<string, unknown>;
    renderBalance(data, flags);
    return;
  }

  let userAddr: Address;

  if (flags.raw.has("address")) {
    userAddr = flags.raw.get("address")! as Address;
    // keyless path - only load RPC/address env
    const env = loadEnv(["RPC_URL", "VAULT_ADDRESS", "USDC_ADDRESS"]);
    await showBalance(env, userAddr, flags);
  } else {
    const env = loadEnv(["RPC_URL", "VAULT_ADDRESS", "USDC_ADDRESS", "USER_PRIVATE_KEY"]);
    userAddr = senderAddress(env.USER_PRIVATE_KEY!);
    await showBalance(env, userAddr, flags);
  }
}

async function showBalance(
  env: ReturnType<typeof loadEnv>,
  userAddr: Address,
  flags: ParsedFlags,
): Promise<void> {
  const pc = makePublicClient(env.RPC_URL!);
  const vault = env.VAULT_ADDRESS!;
  const usdc = env.USDC_ADDRESS!;

  const [usdcBal, usdcDec, shareBal] = await Promise.all([
    pc.readContract({ address: usdc, abi: USDC_ABI, functionName: "balanceOf", args: [userAddr] }),
    pc.readContract({ address: usdc, abi: USDC_ABI, functionName: "decimals" }),
    pc.readContract({ address: vault, abi: VAULT_ABI, functionName: "balanceOf", args: [userAddr] }),
  ]) as [bigint, number, bigint];

  const redeemable = await pc.readContract({
    address: vault, abi: VAULT_ABI, functionName: "previewRedeem", args: [shareBal],
  }) as bigint;

  if (flags.json) {
    printJson(jsonOk("user.balance", {
      address: userAddr,
      usdc: usdcBal.toString(),
      usdcDecimals: usdcDec,
      shares: shareBal.toString(),
      redeemableAssets: redeemable.toString(),
    }), 0);
  }

  log("");
  log(c.bold(`Balances for ${userAddr}`));
  log("");

  table(
    ["Asset", "Balance"],
    [
      ["USDC (wallet)", formatUsdc(usdcBal, usdcDec)],
      ["Vault Shares", shareBal.toLocaleString()],
      ["- Redeemable", formatUsdc(redeemable, usdcDec)],
    ],
  );
  log("");
}

function renderBalance(data: Record<string, unknown>, flags: ParsedFlags): void {
  if (flags.json) {
    printJson(jsonOk("user.balance", data), 0);
    return;
  }
  log("");
  log(c.bold(`Balances for ${data.address}`));
  log("");
  table(
    ["Asset", "Balance"],
    [
      ["USDC (wallet)", String(data.usdc ?? "-")],
      ["Vault Shares", String(data.shares ?? "-")],
      ["- Redeemable", String(data.redeemableUsdc ?? "-")],
    ],
  );
  log("");
}
