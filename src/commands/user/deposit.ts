/**
 * user deposit â€” deposit USDC into the vault, receiving shares.
 *
 * Required env: RPC_URL, USDC_ADDRESS, VAULT_ADDRESS, USER_PRIVATE_KEY
 */

import type { Address } from "viem";
import { encodeFunctionData } from "viem";
import { loadEnv } from "../../env";
import { makePublicClient, makeWalletClient, senderAddress, robinhoodChain } from "../../chain";
import { VAULT_ABI, USDC_ABI } from "../../abi";
import { log, label, c, ok, err, warn, formatUsdc, jsonOk, printJson } from "../../format";
import type { ParsedFlags } from "../../cli";
import { UserAbort } from "../../cli";
import { getApiConfig, apiUserDeposit } from "../../api";

const HELP = `
user deposit â€” Deposit USDC into the vault

USAGE
  wield user deposit --amount <usdc> [flags]

REQUIRED ENV
  RPC_URL, USDC_ADDRESS, VAULT_ADDRESS, USER_PRIVATE_KEY

FLAGS
  --amount <usdc>     USDC amount to deposit (human units, e.g. 100)
  --receiver <addr>   Recipient of vault shares (default: sender)
  --auto-approve      Automatically approve USDC if allowance insufficient
  --yes               Required to broadcast
  --json              Machine-readable output
  --help              Show this help

EXAMPLES
  wield user deposit --amount 100 --yes
  wield user deposit --amount 500 --auto-approve --yes
`;

export default async function deposit(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  const amountRaw = flags.raw.get("amount");
  if (!amountRaw) {
    log(err("Provide --amount <usdc>"));
    process.exit(1);
  }

  if (!flags.yes) {
    log(err("deposit requires --yes to confirm"));
    throw new UserAbort("--yes required");
  }

  const env = loadEnv(["RPC_URL", "USDC_ADDRESS", "VAULT_ADDRESS", "USER_PRIVATE_KEY"]);
  const pc = makePublicClient(env.RPC_URL!);
  const wc = makeWalletClient(env.RPC_URL!, env.USER_PRIVATE_KEY!);
  const user = senderAddress(env.USER_PRIVATE_KEY!);

  const vault = env.VAULT_ADDRESS!;
  const usdc = env.USDC_ADDRESS!;
  const receiverRaw = flags.raw.get("receiver");
  const receiver = receiverRaw ? (receiverRaw as Address) : user;
  const autoApprove = flags.raw.has("auto-approve");

  const amount = parseUsdc(amountRaw);
  const decimals = await pc.readContract({
    address: usdc, abi: USDC_ABI, functionName: "decimals",
  }) as number;

  // Preview shares
  const previewShares = await pc.readContract({
    address: vault, abi: VAULT_ABI, functionName: "previewDeposit", args: [amount],
  }) as bigint;

  log("");
  log(c.bold("DEPOSIT"));
  log(label(`Amount:   ${formatUsdc(amount, decimals)}`));
  log(label(`From:     ${user}`));
  log(label(`Receiver: ${receiver}${receiver === user ? " (self)" : ""}`));
  log(label(`â†’ Shares: ${previewShares.toLocaleString()}`));
  log("");

  // Check allowance
  const allowance = await pc.readContract({
    address: usdc, abi: USDC_ABI, functionName: "allowance", args: [user, vault],
  }) as bigint;

  if (allowance < amount) {
    if (autoApprove) {
      log(warn(`Allowance insufficient (${allowance} < ${amount}). Auto-approving...`));
      const appTx = await wc.writeContract({
        address: usdc, abi: USDC_ABI, functionName: "approve",
        args: [vault, amount], account: wc.account!, chain: robinhoodChain,
      });
      await pc.waitForTransactionReceipt({ hash: appTx });
      log(ok("Approved."));
    } else {
      log(err(`Insufficient allowance: ${allowance} < ${amount}`));
      log(label("Run: wield user approve --amount " + amountRaw + " --yes"));
      process.exit(1);
    }
  }

  log(ok("Sending deposit..."));
  const apiConfig = getApiConfig(flags);

  if (apiConfig) {
    // API mode
    const txData = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: "deposit",
      args: [amount, receiver],
    });
    const signedTx = await wc.signTransaction({
      to: vault,
      data: txData,
      account: wc.account!,
      chain: robinhoodChain,
    });
    const result = await apiUserDeposit(apiConfig, signedTx);
    const hash = result.txHash as string;
    log(label(`TX: ${hash}`));
    log(ok("Transaction submitted via API"));

    if (flags.json) {
      printJson(jsonOk("user.deposit", { amount: amount.toString(), receiver, previewShares: previewShares.toString(), txHash: hash }), 0);
    }
    return;
  }

  // Direct viem
  const txHash = await wc.writeContract({
    address: vault, abi: VAULT_ABI, functionName: "deposit",
    args: [amount, receiver], account: wc.account!, chain: robinhoodChain,
  });
  log(label(`TX: ${txHash}`));

  const receipt = await pc.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === "success") {
    log(ok(`Deposited! Block: ${receipt.blockNumber}`));
    log(ok(`Estimated shares minted: ${previewShares.toLocaleString()}`));

    if (flags.json) {
      printJson(jsonOk("user.deposit", {
        amount: amount.toString(),
        receiver,
        previewShares: previewShares.toString(),
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
