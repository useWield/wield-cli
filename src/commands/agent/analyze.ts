/**
 * agent analyze â€” AI-powered vault health report.
 *
 * Reads vault state from chain, feeds it to an LLM, and returns a structured
 * health report with TVL, risk assessment, and recommendations.
 *
 * Required env: RPC_URL, VAULT_ADDRESS
 * Optional env: DB_PATH (for recent decision context)
 * LLM env: at least one of OPENAI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_HOST
 *
 * Read-only â€” never loads private keys.
 */

import type { Address } from "viem";
import { loadEnv } from "../../env";
import { log, label, c, ok, warn, err, printJson, jsonOk, jsonErr } from "../../format";
import type { ParsedFlags } from "../../cli";
import { detectProvider, showNoProviderMessage, chat, providerLabel, LlmError } from "../../llm/provider";
import { ANALYZE_PROMPT, buildUserMessage } from "../../llm/prompts";
import { gatherAnalyzeContext } from "../../llm/context";

const HELP = `
agent analyze â€” AI vault health report

USAGE
  wield agent analyze [flags]

REQUIRED ENV
  RPC_URL, VAULT_ADDRESS
  Plus ONE of: OPENAI_API_KEY, ANTHROPIC_API_KEY, OLLAMA_HOST

FLAGS
  --json       Machine-readable output
  --help       Show this help
  --no-db      Skip reading agent database (faster, less context)

DESCRIPTION
  Reads vault state from chain, then uses an LLM to produce a structured
  health report: TVL summary, risk assessment, and operator recommendations.

  Provider auto-detection: OPENAI_API_KEY â†’ OpenAI GPT-4o-mini,
  ANTHROPIC_API_KEY â†’ Anthropic Claude Haiku, OLLAMA_HOST â†’ local Ollama.
`;

export default async function analyze(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  // Detect LLM provider
  const llm = detectProvider();
  if (!llm) {
    showNoProviderMessage();
    if (flags.json) printJson(jsonErr("agent.analyze", { code: "NO_PROVIDER", message: "No LLM provider configured" }), 1);
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
  log(`  ${c.bold("Wield Vault Analysis")}`);
  log(`  ${c.dim("â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€")}`);
  log(`  Provider:  ${label(providerLabel(llm))}`);
  log(`  Vault:     ${label(vaultAddress)}`);
  log(`  DB:        ${label(skipDb ? "skipped" : (dbPath ? "enabled" : "not set (--no-db to skip)"))}`);
  log("");
  log(`  ${c.dim("Gathering vault data from chain...")}`);

  try {
    const ctx = await gatherAnalyzeContext(rpcUrl, vaultAddress as Address, dbPath);
    log(`  ${ok("Data collected.")}`);
    log("");
    log(`  ${c.dim("Asking AI to analyze...")}`);
    log("");

    const userMsg = buildUserMessage("Analyze this vault's health and provide a report.", ctx as unknown as Record<string, unknown>);
    const response = await chat(llm, ANALYZE_PROMPT, userMsg);

    if (flags.json) {
      printJson(jsonOk("agent.analyze", {
        provider: llm.provider,
        model: llm.model,
        vault: ctx.vault,
        recentDecisionsCount: ctx.recentDecisions.length,
        report: response,
      }), 0);
    }

    // Pretty output
    log(`  ${c.bold("â”€â”€ AI Health Report")} ${label(`(${providerLabel(llm)})`)}`);
    log("");
    for (const line of response.split("\n")) {
      log(line.startsWith("#") ? `  ${c.bold(line)}` : `  ${line}`);
    }
    log("");

  } catch (e: unknown) {
    if (e instanceof LlmError) {
      log(`  ${err(`LLM Error: ${e.message}`)}`);
      if (flags.json) printJson(jsonErr("agent.analyze", { code: e.code, message: e.message }), 4);
      process.exit(4);
    }
    throw e;
  }
}
