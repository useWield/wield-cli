/**
 * agent explain - AI-powered decision explanation.
 *
 * Reads a single decision from the agent database by ID, feeds it to an LLM
 * with vault context, and returns a plain-English explanation of what happened.
 *
 * Required env: RPC_URL, VAULT_ADDRESS, DB_PATH
 * LLM env: at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_HOST
 *
 * Read-only - never loads private keys.
 */

import type { Address } from "viem";
import { loadEnv } from "../../env";
import { log, label, c, ok, warn, err, printJson, jsonOk, jsonErr, truncateHash } from "../../format";
import type { ParsedFlags } from "../../cli";
import { detectProvider, showNoProviderMessage, chat, providerLabel, LlmError } from "../../llm/provider";
import { EXPLAIN_PROMPT, buildUserMessage } from "../../llm/prompts";
import { gatherExplainContext } from "../../llm/context";

const HELP = `
agent explain - AI explanation of one decision

USAGE
  wield agent explain --id <n> [flags]

REQUIRED ENV
  RPC_URL, VAULT_ADDRESS, DB_PATH
  Plus ONE of: OPENAI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_HOST

FLAGS
  --id <n>      Decision ID to explain (REQUIRED)
  --json        Machine-readable output
  --help        Show this help

DESCRIPTION
  Fetches a single decision from the agent database, then asks the LLM to
  explain what happened: allocation breakdown, on-chain result, and operator
  takeaway.

EXAMPLES
  wield agent explain --id 1
  wield agent explain --id 3 --json
`;

export default async function explain(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  // Parse --id
  const idRaw = flags.raw.get("id");
  if (!idRaw) {
    log(`${err("Missing --id flag.")} Usage: agent explain --id <n>`);
    process.exit(1);
  }
  const decisionId = parseInt(idRaw, 10);
  if (isNaN(decisionId) || decisionId < 1) {
    log(`${err("--id must be a positive integer.")}`);
    process.exit(1);
  }

  // Detect LLM provider
  const llm = detectProvider();
  if (!llm) {
    showNoProviderMessage();
    if (flags.json) printJson(jsonErr("agent.explain", { code: "NO_PROVIDER", message: "No LLM provider configured" }), 1);
    process.exit(1);
  }

  // Read-only, no private keys
  const env = loadEnv(["RPC_URL", "VAULT_ADDRESS", "DB_PATH"]);
  const rpcUrl = env.RPC_URL!;
  const vaultAddress = env.VAULT_ADDRESS!;
  const dbPath = env.DB_PATH!;

  log("");
  log(`  ${c.bold("Wield Decision Explanation")}`);
  log(`  ${c.dim("-")}`);
  log(`  Provider:  ${label(providerLabel(llm))}`);
  log(`  Decision:  ${label(`#${decisionId}`)}`);
  log(`  DB:        ${label(dbPath)}`);
  log("");

  try {
    log(`  ${c.dim("Fetching decision from database...")}`);
    const ctx = await gatherExplainContext(rpcUrl, vaultAddress as Address, dbPath, decisionId);
    log(`  ${ok(`Found decision #${decisionId}`)} - ${label(ctx.decision.status)} - ${label(ctx.decision.ts)}`);
    log("");
    log(`  ${c.dim("Asking AI to explain...")}`);
    log("");

    const userMsg = buildUserMessage(
      `Explain decision #${decisionId} from the vault operator's perspective.`,
      ctx as unknown as Record<string, unknown>,
    );
    const response = await chat(llm, EXPLAIN_PROMPT, userMsg);

    if (flags.json) {
      printJson(jsonOk("agent.explain", {
        provider: llm.provider,
        model: llm.model,
        decision: {
          id: ctx.decision.id,
          ts: ctx.decision.ts,
          nonce: ctx.decision.nonce,
          intentHash: ctx.decision.intent_hash,
          allocations: ctx.decision.allocations_json,
          txHash: ctx.decision.tx_hash,
          status: ctx.decision.status,
        },
        explanation: response,
      }), 0);
    }

    // Pretty output
    log(`  ${c.bold("- Decision Explanation")} ${label(`(${providerLabel(llm)})`)}`);
    log(`  ${label(`TX: ${ctx.decision.tx_hash ? truncateHash(ctx.decision.tx_hash) : "none"}`)}`);
    log("");
    for (const line of response.split("\n")) {
      log(line.startsWith("#") ? `  ${c.bold(line)}` : `  ${line}`);
    }
    log("");

  } catch (e: unknown) {
    if (e instanceof LlmError) {
      log(`  ${err(`LLM Error: ${e.message}`)}`);
      if (flags.json) printJson(jsonErr("agent.explain", { code: e.code, message: e.message }), 4);
      process.exit(4);
    }
    // "Decision not found" from context.ts
    if (e instanceof Error && e.message.startsWith("Decision #")) {
      log(`  ${err(e.message)}`);
      if (flags.json) printJson(jsonErr("agent.explain", { code: "NOT_FOUND", message: e.message }), 1);
      process.exit(1);
    }
    throw e;
  }
}
