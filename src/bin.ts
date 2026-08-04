#!/usr/bin/env bun
/**
 * bin.ts â€” Wield CLI entry point.
 *
 * Usage: bun run src/bin.ts <agent|user> <command> [flags]
 */

import { run } from "./cli";

const argv = process.argv.slice(2);

run(argv).catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`fatal: ${msg}\n`);

  // map error name to exit code
  if (e instanceof Error) {
    switch (e.name) {
      case "EnvError": process.exit(3);
      case "RpcError": process.exit(4);
      case "TxError": process.exit(5);
      case "UserAbort": process.exit(2);
      default: process.exit(1);
    }
  }
  process.exit(1);
});
