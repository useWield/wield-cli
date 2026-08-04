/**
 * user approve - approve USDC spending for the vault.
 *
 * Required env: RPC_URL, USDC_ADDRESS, VAULT_ADDRESS, USER_PRIVATE_KEY
 */

import { type Address, type Hex, encodeFunctionData } from "viem";
import { loadEnv } from "../../env";
import { makePublicClient, makeWalletClient, senderAddress, robinhoodChain } from "../../chain";
import { USDC_ABI } from "../../abi";
import { log, label, c, ok, err, formatUsdc, jsonOk, printJson } from "../../format";
import type { ParsedFlags } from "../../cli";
import { UserAbort } from "../../cli";
import { getApiConfig, apiUserApprove } from "../../api";

const HELP = `
user approve - Approve USDC spending for the vault

USAGE
  wield user approve --amount <usdc> | --max [flags]

REQUIRED ENV
  RPC_URL, USDC_ADDRESS, VAULT_ADDRESS, USER_PRIVATE_KEY

FLAGS
  --amount <usdc>  USDC amount to approve (human units, e.g. 100.50)
  --max            Approve max uint256 (full unlimited allowance)
  --yes            Required to broadcast (no dry-run for approve)
  --json           Machine-readable output
  --help           Show this help

EXAMPLES
  wield user approve --amount 500 --yes
  wield user approve --max --yes --json
`;

export default async function approve(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  const amountRaw = flags.raw.get("amount");
  const useMax = flags.raw.has("max");

  if (!amountRaw && !useMax) {
    log(err("Provide --amount <usdc> or --max"));
    process.exit(1);
  }

  if (!flags.yes) {
    log(err("approve requires --yes to confirm"));
    throw new UserAbort("--yes required");
  }

  const env = loadEnv(["RPC_URL", "USDC_ADDRESS", "VAULT_ADDRESS", "USER_PRIVATE_KEY"]);
  const pc = makePublicClient(env.RPC_URL!);
  const wc = makeWalletClient(env.RPC_URL!, env.USER_PRIVATE_KEY!);
  const user = senderAddress(env.USER_PRIVATE_KEY!);
  const usdc = env.USDC_ADDRESS!;
  const vault = env.VAULT_ADDRESS!;

  let amount: bigint;
  if (useMax) {
    amount = 2n ** 256n - 1n;
  } else {
    amount = parseUsdc(amountRaw!);
  }

  const decimals = await pc.readContract({
    address: usdc, abi: USDC_ABI, functionName: "decimals",
  }) as number;

  log("");
  log(c.bold("APPROVE USDC"));
  log(label(`Spender: ${vault}`));
  log(label(`Amount:  ${useMax ? "MAX (unlimited)" : formatUsdc(amount, decimals)}`));
  log(label(`From:    ${user}`));
  log("");

  log(ok("Sending approval transaction..."));
  const apiConfig = getApiConfig(flags);

  if (apiConfig) {
    // API mode: sign locally, broadcast via API
    const txData = encodeFunctionData({
      abi: USDC_ABI,
      functionName: "approve",
      args: [vault, amount],
    });
    const signedTx = await wc.signTransaction({
      to: usdc,
      data: txData,
      account: wc.account!,
      chain: robinhoodChain,
    });
    const result = await apiUserApprove(apiConfig, signedTx);
    const hash = result.txHash as string;
    log(label(`TX: ${hash}`));
    log(ok("Transaction submitted via API"));

    if (flags.json) {
      printJson(jsonOk("user.approve", { spender: vault, amount: amount.toString(), txHash: hash }), 0);
    }
    return;
  }

  // Direct viem
  const txHash = await wc.writeContract({
    address: usdc,
    abi: USDC_ABI,
    functionName: "approve",
    args: [vault, amount],
    account: wc.account!,
    chain: robinhoodChain,
  });
  log(label(`TX: ${txHash}`));

  const receipt = await pc.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === "success") {
    log(ok(`Approved! Block: ${receipt.blockNumber}`));

    if (flags.json) {
      printJson(jsonOk("user.approve", {
        spender: vault,
        amount: amount.toString(),
        txHash,
        block: Number(receipt.blockNumber),
      }), 0);
    }
  } else {
    log(err("Transaction reverted!"));
    process.exit(5);
  }
}

function parseUsdc(raw: string): bigint {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) {
    log(err(`Invalid USDC amount: ${raw}`));
    process.exit(1);
  }
  const intPart = Math.floor(num);
  const fracPart = raw.includes(".") ? raw.split(".")[1].padEnd(6, "0").slice(0, 6) : "000000";
  return BigInt(intPart) * 10n ** 6n + BigInt(fracPart);
}
