/**
 * user withdraw - withdraw assets from the vault (by shares or asset amount).
 *
 * Required env: RPC_URL, USDC_ADDRESS, VAULT_ADDRESS, USER_PRIVATE_KEY
 */

import type { Address } from "viem";
import { encodeFunctionData } from "viem";
import { loadEnv } from "../../env";
import { makePublicClient, makeWalletClient, senderAddress, robinhoodChain } from "../../chain";
import { VAULT_ABI } from "../../abi";
import { log, label, c, ok, err, formatUsdc, jsonOk, printJson } from "../../format";
import type { ParsedFlags } from "../../cli";
import { UserAbort } from "../../cli";
import { getApiConfig, apiUserWithdraw } from "../../api";

const HELP = `
user withdraw - Withdraw assets from the vault

USAGE
  wield user withdraw --assets <usdc> | --shares <n> [flags]

REQUIRED ENV
  RPC_URL, USDC_ADDRESS, VAULT_ADDRESS, USER_PRIVATE_KEY

FLAGS
  --assets <usdc>    Amount of USDC to withdraw (human units)
  --shares <n>       Number of vault shares to redeem (integer)
  --receiver <addr>  Recipient of withdrawn assets (default: sender)
  --owner <addr>     Owner of shares being redeemed (default: sender)
  --yes              Required to broadcast
  --json             Machine-readable output
  --help             Show this help

EXAMPLES
  wield user withdraw --assets 100 --yes
  wield user withdraw --shares 1000 --yes
`;

export default async function withdraw(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  const assetsRaw = flags.raw.get("assets");
  const sharesRaw = flags.raw.get("shares");

  if (!assetsRaw && !sharesRaw) {
    log(err("Provide --assets <usdc> or --shares <n>"));
    process.exit(1);
  }
  if (assetsRaw && sharesRaw) {
    log(err("Provide --assets XOR --shares, not both"));
    process.exit(1);
  }

  if (!flags.yes) {
    log(err("withdraw requires --yes to confirm"));
    throw new UserAbort("--yes required");
  }

  const env = loadEnv(["RPC_URL", "USDC_ADDRESS", "VAULT_ADDRESS", "USER_PRIVATE_KEY"]);
  const pc = makePublicClient(env.RPC_URL!);
  const wc = makeWalletClient(env.RPC_URL!, env.USER_PRIVATE_KEY!);
  const user = senderAddress(env.USER_PRIVATE_KEY!);

  const vault = env.VAULT_ADDRESS!;
  const usdc = env.USDC_ADDRESS!;

  const receiverRaw = flags.raw.get("receiver");
  const ownerRaw = flags.raw.get("owner");
  const receiver = receiverRaw ? (receiverRaw as Address) : user;
  const ownerAddr = ownerRaw ? (ownerRaw as Address) : user;

  let assets: bigint;

  if (sharesRaw) {
    const shares = parseBigInt(sharesRaw);
    assets = await pc.readContract({
      address: vault, abi: VAULT_ABI, functionName: "previewRedeem", args: [shares],
    }) as bigint;

    log("");
    log(c.bold("WITHDRAW"));
    log(label(`Shares:   ${shares.toLocaleString()}`));
    log(label(`- Assets: ${formatUsdc(assets, 6)}`));
    log(label(`Receiver: ${receiver}`));
    log(label(`Owner:    ${ownerAddr}`));
    log("");
  } else {
    assets = parseUsdc(assetsRaw!);

    log("");
    log(c.bold("WITHDRAW"));
    log(label(`Assets:   ${formatUsdc(assets, 6)}`));
    log(label(`Receiver: ${receiver}`));
    log(label(`Owner:    ${ownerAddr}`));
    log("");
  }

  log(ok("Sending withdrawal..."));
  const apiConfig = getApiConfig(flags);

  if (apiConfig) {
    // API mode
    const txData = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: "withdraw",
      args: [assets, receiver, ownerAddr],
    });
    const signedTx = await wc.signTransaction({
      to: vault,
      data: txData,
      account: wc.account!,
      chain: robinhoodChain,
    });
    const result = await apiUserWithdraw(apiConfig, signedTx);
    const hash = result.txHash as string;
    log(label(`TX: ${hash}`));
    log(ok("Transaction submitted via API"));

    if (flags.json) {
      printJson(jsonOk("user.withdraw", { assets: assets.toString(), receiver, owner: ownerAddr, txHash: hash }), 0);
    }
    return;
  }

  // Direct viem
  const txHash = await wc.writeContract({
    address: vault, abi: VAULT_ABI, functionName: "withdraw",
    args: [assets, receiver, ownerAddr], account: wc.account!, chain: robinhoodChain,
  });
  log(label(`TX: ${txHash}`));

  const receipt = await pc.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === "success") {
    log(ok(`Withdrawn! Block: ${receipt.blockNumber}`));

    if (flags.json) {
      printJson(jsonOk("user.withdraw", {
        assets: assets.toString(),
        receiver,
        owner: ownerAddr,
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

function parseBigInt(raw: string): bigint {
  const n = BigInt(raw);
  if (n <= 0n) {
    log(err(`Invalid amount: ${raw}`));
    process.exit(1);
  }
  return n;
}
