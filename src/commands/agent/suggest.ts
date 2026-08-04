/**
 * agent suggest - AI-powered operator recommendations.
 *
 * Reads vault state + recent decisions, feeds context to an LLM, and returns
 * actionable suggestions: when to rebalance, portfolio adjustments, risk flags.
 *
 * Required env: RPC_URL, VAULT_ADDRESS
 * Optional env: DB_PATH (for decision history context)
 * LLM env: at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_HOST
 *
 * Read-only - never loads private keys.
 */

import type { Address } from "viem";
import { loadEnv } from "../../env";
import { log, label, c, ok, warn, err, printJson, jsonOk, jsonErr } from "../../format";
import type { ParsedFlags } from "../../cli";
import { detectProvider, showNoProviderMessage, chat, providerLabel, LlmError } from "../../llm/provider";
import { SUGGEST_PROMPT, buildUserMessage } from "../../llm/prompts";
import { gatherSuggestContext } from "../../llm/context";

const HELP = `
agent suggest - AI operator recommendations

USAGE
  wield agent suggest [flags]

REQUIRED ENV
  RPC_URL, VAULT_ADDRESS
  Plus ONE of: OPENAI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_HOST

FLAGS
  --json       Machine-readable output
  --help       Show this help
  --no-db      Skip reading agent database (faster, less context)

DESCRIPTION
  Reads vault state from chain and recent decision history, then asks the LLM
  for operator recommendations: when to rebalance, portfolio adjustments,
  risk flags, and gas/timing notes.

  Provider auto-detection: OPENAI_API_KEY - OpenAI GPT-4o-mini,
  ANTHROPIC_API_KEY - Anthropic Claude Haiku, OLLAMA_HOST - local Ollama.

EXAMPLES
  wield agent suggest
  wield agent suggest --no-db
  wield agent suggest --json
`;

export default async function suggest(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  // Detect LLM provider
  const llm = detectProvider();
  if (!llm) {
    showNoProviderMessage();
    if (flags.json) printJson(jsonErr("agent.suggest", { code: "NO_PROVIDER", message: "No LLM provider configured" }), 1);
    process.exit(1);
  }

  // Read-only, no private keys
  const env = loadEnv(["RPC_URL", "VAULT_ADDRESS"]);
  const rpcUrl = env.RPC_URL!;
  const vaultAddress = env.VAULT_ADDRESS!;

  // Optional DB path
  const skipDb = flags.raw.has("no-db");
  const dbPath = skipDb ? undefined : (process.env.DB_PATH ?? undefined);

  log("");
  log(`  ${c.bold("Wield Operator Suggestions")}`);
  log(`  ${c.dim("-")}`);
  log(`  Provider:  ${label(providerLabel(llm))}`);
  log(`  Vault:     ${label(vaultAddress)}`);
  log(`  DB:        ${label(skipDb ? "skipped" : (dbPath ? "enabled" : "not set (--no-db to skip)"))}`);
  log("");
  log(`  ${c.dim("Gathering context from chain...")}`);

  try {
    const ctx = await gatherSuggestContext(rpcUrl, vaultAddress as Address, dbPath);
    log(`  ${ok("Context ready.")}`);
    log("");
    log(`  ${c.dim("Asking AI for recommendations...")}`);
    log("");

    const userMsg = buildUserMessage(
      "Based on this vault state and recent decisions, what should the operator do?",
      ctx as unknown as Record<string, unknown>,
    );
    const response = await chat(llm, SUGGEST_PROMPT, userMsg);

    if (flags.json) {
      printJson(jsonOk("agent.suggest", {
        provider: llm.provider,
        model: llm.model,
        vault: ctx.vault,
        recentDecisionsCount: ctx.recentDecisions.length,
        suggestions: response,
      }), 0);
    }

    // Pretty output
    log(`  ${c.bold("- Operator Suggestions")} ${label(`(${providerLabel(llm)})`)}`);
    log("");
    for (const line of response.split("\n")) {
      log(line.startsWith("#") ? `  ${c.bold(line)}` : `  ${line}`);
    }
    log("");

  } catch (e: unknown) {
    if (e instanceof LlmError) {
      log(`  ${err(`LLM Error: ${e.message}`)}`);
      if (flags.json) printJson(jsonErr("agent.suggest", { code: e.code, message: e.message }), 4);
      process.exit(4);
    }
    throw e;
  }
}
