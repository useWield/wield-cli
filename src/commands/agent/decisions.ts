/**
 * agent decisions - list recent decision rows from the agent DB.
 *
 * Required env: DB_PATH
 */

import { loadEnv } from "../../env";
import { openDecisionsRead } from "../../db";
import { log, label, table, jsonOk, printJson, truncateHash, formatTimestamp } from "../../format";
import type { ParsedFlags } from "../../cli";
import { getApiConfig, apiAgentDecisions } from "../../api";

const HELP = `
agent decisions - List recent agent decisions

USAGE
  wield agent decisions [flags]

REQUIRED ENV
  DB_PATH

FLAGS
  --limit <n>     Max rows (default 20)
  --status <s>    Filter: submitted | confirmed | failed
  --json          Machine-readable output
  --help          Show this help

DESCRIPTION
  Opens the agent database in read-only mode and lists decision rows
  in reverse chronological order.
`;

interface DecisionRow {
  id: number;
  ts: string;
  intent_hash: string;
  nonce: number;
  allocations_json: string;
  tx_hash: string | null;
  status: string;
  error_msg: string | null;
}

export default async function decisions(_args: string[], flags: ParsedFlags): Promise<void> {
  if (flags.help) {
    log(HELP.trim());
    return;
  }

  const apiConfig = getApiConfig(flags);
  const limit = Math.min(Number(flags.raw.get("limit") ?? "20"), 100);
  const filterStatus = flags.raw.get("status") || undefined;

  if (apiConfig) {
    // API mode
    const rows = await apiAgentDecisions(apiConfig, limit, filterStatus) as DecisionRow[];
    renderDecisions(rows, flags);
    return;
  }

  const env = loadEnv(["DB_PATH"]);
  const db = openDecisionsRead(env.DB_PATH!);

  let sql = "SELECT * FROM decisions";
  const params: (string | number)[] = [];
  if (filterStatus) {
    sql += " WHERE status = ?";
    params.push(filterStatus);
  }
  sql += " ORDER BY id DESC LIMIT ?";
  params.push(limit);

  const stmt = db.query(sql);
  const rows = stmt.all(...params as [string | number, ...(string | number)[]]) as DecisionRow[];
  renderDecisions(rows, flags);
}

function renderDecisions(rows: DecisionRow[], flags: ParsedFlags): void {
  if (flags.json) {
    printJson(jsonOk("agent.decisions", {
      count: rows.length,
      rows: rows.map(r => ({
        id: r.id,
        ts: r.ts,
        nonce: r.nonce,
        intentHash: r.intent_hash,
        allocations: safeParseJson(r.allocations_json),
        txHash: r.tx_hash,
        status: r.status,
        errorMsg: r.error_msg,
      })),
    }), 0);
    return;
  }

  if (rows.length === 0) {
    log(label("No decisions found."));
    return;
  }

  table(
    ["ID", "Time", "Status", "Nonce", "Intent", "TX"],
    rows.map(r => [
      String(r.id),
      formatTimestamp(r.ts),
      r.status,
      String(r.nonce),
      truncateHash(r.intent_hash),
      r.tx_hash ? truncateHash(r.tx_hash) : "(none)",
    ]),
  );

  log(`\n  ${label(`${rows.length} row(s)`)}`);
}

function safeParseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return raw; }
}
