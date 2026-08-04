/**
 * cli.ts â€” command router and global flag handling.
 *
 * Parses top-level namespace (agent|user), applies --json, --yes, --help,
 * --version globally, then dispatches to the appropriate command handler.
 */

import { setJsonMode, log } from "./format";
import { version } from "../package.json";
import agentStatus from "./commands/agent/status";
import agentDecisions from "./commands/agent/decisions";
import agentTick from "./commands/agent/tick";
import agentAnalyze from "./commands/agent/analyze";
import agentExplain from "./commands/agent/explain";
import agentSuggest from "./commands/agent/suggest";
import userPreview from "./commands/user/preview";
import userBalance from "./commands/user/balance";
import userApprove from "./commands/user/approve";
import userDeposit from "./commands/user/deposit";
import userWithdraw from "./commands/user/withdraw";

// ---- custom errors ----

export class RpcError extends Error {
  constructor(msg: string) { super(msg); this.name = "RpcError"; }
}

export class TxError extends Error {
  constructor(msg: string) { super(msg); this.name = "TxError"; }
}

export class UserAbort extends Error {
  constructor(msg = "user aborted") { super(msg); this.name = "UserAbort"; }
}

// ---- flag parser ----

export interface ParsedFlags {
  json: boolean;
  yes: boolean;
  help: boolean;
  broadcast: boolean;
  /** API key for thin-client mode (cli â†’ api â†’ chain). */
  apiKey: string | null;
  /** API base URL (default https://app.usewield.io). */
  apiUrl: string | null;
  // arbitrary string flags
  raw: Map<string, string>;
  positional: string[];
}

function parseFlags(args: string[]): ParsedFlags {
  const flags: ParsedFlags = {
    json: false,
    yes: false,
    help: false,
    broadcast: false,
    apiKey: null,
    apiUrl: null,
    raw: new Map(),
    positional: [],
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      flags.json = true;
    } else if (a === "--yes") {
      flags.yes = true;
    } else if (a === "--help" || a === "-h") {
      flags.help = true;
    } else if (a === "--broadcast") {
      flags.broadcast = true;
    } else if (a.startsWith("--api-key")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags.apiKey = a.slice(eq + 1);
      } else {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags.apiKey = next;
          i++;
        }
      }
    } else if (a.startsWith("--api-url")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags.apiUrl = a.slice(eq + 1);
      } else {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags.apiUrl = next;
          i++;
        }
      }
    } else if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        const key = a.slice(2, eq);
        const val = a.slice(eq + 1);
        flags.raw.set(key, val);
      } else {
        const key = a.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags.raw.set(key, next);
          i++;
        } else {
          flags.raw.set(key, "true");
        }
      }
    } else {
      flags.positional.push(a);
    }
  }

  return flags;
}

// ---- help text ----

const TOP_HELP = `
${"Wield CLI".toUpperCase()}
  Autonomous Allocation for Real-World Assets

USAGE
  wield <namespace> <command> [flags]

NAMESPACES
  agent     Operator commands (rebalance, status, decisions)
  user      Vault-user commands (balance, deposit, withdraw, preview)

GLOBAL FLAGS
  --json       Machine-readable JSON output on stdout
  --yes        Skip confirmation prompts
  --help, -h   Show help for the command
  --api-key    API key for thin-client mode (cli â†’ API â†’ chain)
  --api-url    API base URL (default https://app.usewield.io)

EXAMPLES
  wield agent status
  wield agent tick
  wield agent tick --broadcast --yes
  wield agent decisions --limit 5
  wield agent analyze
  wield agent explain --id 1
  wield agent suggest
  wield user preview --deposit 100
  wield user balance
  wield user approve --max --yes
  wield user deposit --amount 100 --yes

Run 'wield agent --help' or 'wield user --help'
for subcommand details.
`;

// ---- router ----

type CommandHandler = (
  args: string[],
  flags: ParsedFlags,
) => Promise<void>;

const NS_COMMANDS: Record<string, string[]> = {
  agent: ["status", "decisions", "tick", "analyze", "explain", "suggest"],
  user: ["preview", "balance", "approve", "deposit", "withdraw"],
};

async function showNamespaceHelp(ns: "agent" | "user"): Promise<void> {
  const cmds = NS_COMMANDS[ns];
  log(`Commands under '${ns}':`);
  for (const c of cmds) {
    log(`  ${c}`);
  }
  log(`\nRun 'wield ${ns} <command> --help' for details.`);
}

export async function run(argv: string[]): Promise<void> {
  if (argv.length === 0 || (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h"))) {
    log(TOP_HELP.trim());
    return;
  }

  if (argv[0] === "--version") {
    log(`wield-cli v${version}`);
    return;
  }

  const namespace = argv[0];
  if (namespace !== "agent" && namespace !== "user") {
    log(TOP_HELP.trim());
    return;
  }

  if (argv.length < 2 || argv[1] === "--help" || argv[1] === "-h") {
    await showNamespaceHelp(namespace);
    return;
  }

  const command = argv[1];
  const flags = parseFlags(argv.slice(2));

  if (flags.help) {
    // let the command handler deal with --help
  }

  setJsonMode(flags.json);

  let handler: CommandHandler | undefined;

  if (namespace === "agent") {
    switch (command) {
      case "status": handler = agentStatus; break;
      case "decisions": handler = agentDecisions; break;
      case "tick": handler = agentTick; break;
      case "analyze": handler = agentAnalyze; break;
      case "explain": handler = agentExplain; break;
      case "suggest": handler = agentSuggest; break;
    }
  } else if (namespace === "user") {
    switch (command) {
      case "preview": handler = userPreview; break;
      case "balance": handler = userBalance; break;
      case "approve": handler = userApprove; break;
      case "deposit": handler = userDeposit; break;
      case "withdraw": handler = userWithdraw; break;
    }
  }

  if (!handler) {
    log(`Unknown command: ${namespace} ${command}`);
    await showNamespaceHelp(namespace as "agent" | "user");
    return;
  }

  await handler(flags.positional, flags);
}
