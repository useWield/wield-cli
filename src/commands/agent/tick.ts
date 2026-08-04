/**
 * agent tick â€” one-shot rebalance (probe â†’ pick â†’ sign â†’ dry-run or submit).
 *
 * DEFAULT: dry-run.  Broadcast requires BOTH --broadcast AND --yes.
 *
 * Required env: RPC_URL, VAULT_ADDRESS, AGENT_PRIVATE_KEY, UNDERLYING_1, UNDERLYING_2
 * Never reads USER_PRIVATE_KEY.
 */

import { type Address, encodeFunctionData } from "viem";

import { loadEnv } from "../../env";
import { makePublicClient, makeWalletClient, robinhoodChain } from "../../chain";
import { VAULT_ABI } from "../../abi";
import { ERC4626_ABI } from "../../abi";
import { hashIntent, signIntent } from "../../sign";
import { pickAllocation, type ApySample } from "../../strategy";
import type { Intent } from "../../types";
import { log, label, c, ok, warn, err, jsonOk, jsonErr, printJson, formatBps, truncateHash, table } from "../../format";
import type { ParsedFlags } from "../../cli";
import { UserAbort } from "../../cli";
import { getApiConfig, apiAgentTick } from "../../api";

const HELP = `
agent tick â€” Run one rebalance cycle (dry-run by default)

USAGE
  wield agent tick [flags]

REQUIRED ENV
  RPC_URL, VAULT_ADDRESS, AGENT_PRIVATE_KEY, UNDERLYING_1, UNDERLYING_2

FLAGS
  --broadcast        Opt in to sending the transaction
  --yes              Required with --broadcast to actually broadcast
  --deadline-secs N  Intent deadline offset in seconds (default 300)
  --json             Machine-readable output
  --help             Show this help

BEHAVIOUR
  Without --broadcast       Dry-run: probe, pick, sign, print intent (no tx)
  --broadcast without --yes Prints broadcast preview, exits 2 (USER_ABORTED)
  --broadcast --yes         Probes, picks, signs, and sends the rebalance tx

EXAMPLES
  wield agent tick                      # dry-run
  wield agent tick --broadcast          # preview, no tx (exit 2)
  wield agent tick --broadcast --yes    # full broadcast
  wield agent tick --json               # dry-run, JSON output
`;

export default async function tick(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  // --broadcast requires --yes
  if (flags.broadcast && !flags.yes) {
    log(warn("Broadcast requested but --yes not provided."));
    log(label("Run with --broadcast --yes to confirm, or omit --broadcast for a dry run."));
    throw new UserAbort("--yes required with --broadcast");
  }

  const doBroadcast = flags.broadcast && flags.yes;

  const env = loadEnv(["RPC_URL", "VAULT_ADDRESS", "AGENT_PRIVATE_KEY", "UNDERLYING_1", "UNDERLYING_2"]);
  const pc = makePublicClient(env.RPC_URL!);
  const wc = makeWalletClient(env.RPC_URL!, env.AGENT_PRIVATE_KEY!);

  const vault = env.VAULT_ADDRESS!;
  const underlyings = [env.UNDERLYING_1!, env.UNDERLYING_2!];
  const deadlineSecs = Number(flags.raw.get("deadline-secs") ?? "300");

  log(c.bold(doBroadcast ? "TICK (BROADCAST)" : "TICK (DRY RUN)"));
  log(label(`Vault: ${vault}`));
  log("");

  // 1. Read next nonce
  const nonce = await pc.readContract({
    address: vault,
    abi: VAULT_ABI,
    functionName: "nextNonce",
  }) as bigint;
  log(label(`Nonce: ${nonce}`));

  // 2. Probe APY for each underlying
  const samples: ApySample[] = [];
  for (const asset of underlyings) {
    try {
      const ratio = await pc.readContract({
        address: asset,
        abi: ERC4626_ABI,
        functionName: "convertToAssets",
        args: [10n ** 18n],
      }) as bigint;
      // APY proxy: ratio scaled to bps (ratio/1e18 * 1e4 â†’ but ratio is already assets per 1 share-at-decimals)
      // agent uses raw convertToAssets(1e18) / 1e12 as APY bps proxy
      const apyBps = Number(ratio / 10n ** 12n);
      samples.push({ address: asset as Address, apyBps: Math.min(apyBps, 999999) });
      log(label(`  ${asset}: ratio=${ratio}, apyBps=${apyBps}`));
    } catch (e: unknown) {
      log(warn(`  ${asset}: RPC error â€” ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  if (samples.length === 0) {
    log(err("No underlying assets could be probed. Check RPC and UNDERLYING_X env."));
    process.exit(1);
  }

  // 3. Pick allocation
  const allocations = pickAllocation(samples);
  log("");
  log(c.bold("Allocation:"));
  table(
    ["Asset", "BPS", "Share"],
    allocations.map((a) => [a.asset, formatBps(a.bps), `${a.bps / 100}%`]),
  );
  log("");

  // 4. Build intent
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSecs);
  const intent: Intent = { nonce, deadline, allocations };

  // 5. Hash & sign
  const digest = hashIntent(intent, vault, robinhoodChain.id);
  const sig = await signIntent(
    wc.account!,
    digest,
  );

  log(label(`Digest: ${truncateHash(digest)}`));
  log(label(`Signature: ${truncateHash(sig)}`));
  log("");

  if (flags.json) {
    printJson(jsonOk("agent.tick", {
      broadcast: doBroadcast,
      vault,
      nonce: nonce.toString(),
      deadline: deadline.toString(),
      allocations: allocations.map((a) => ({ asset: a.asset, bps: a.bps })),
      digest,
      signature: truncateHash(sig),
      ...(doBroadcast ? { txHash: null } : {}),
    }), 0);
  }

  if (!doBroadcast) {
    log(ok("DRY RUN COMPLETE â€” no transaction sent."));
    log(label("Add --broadcast --yes to submit."));
    return;
  }

  // 6. Broadcast
  log(ok("Broadcasting rebalance transaction..."));
  const apiConfig = getApiConfig(flags);

  if (apiConfig) {
    // API mode: sign tx locally, send to API
    const data = encodeFunctionData({
      abi: VAULT_ABI,
      functionName: "rebalance",
      args: [intent, sig],
    });
    const signedTx = await wc.signTransaction({
      to: vault,
      data,
      account: wc.account!,
      chain: robinhoodChain,
    });
    const result = await apiAgentTick(apiConfig, signedTx);
    const hash = result.txHash as string;
    log(label(`TX: ${hash}`));
    log(ok("Transaction submitted via API"));
  } else {
    // Direct viem
    const txHash = await wc.writeContract({
      address: vault,
      abi: VAULT_ABI,
      functionName: "rebalance",
      args: [intent, sig],
      account: wc.account!,
      chain: robinhoodChain,
    });
    log(label(`TX: ${txHash}`));

    // 7. Wait for receipt
    const receipt = await pc.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === "success") {
      log(ok(`Confirmed in block ${receipt.blockNumber}`));
    } else {
      log(err("Transaction reverted!"));
      if (flags.json) {
        printJson(jsonErr("agent.tick", { code: "TX_REVERTED", message: `TX ${txHash} reverted` }), 5);
      }
      process.exit(5);
    }
  }
}
