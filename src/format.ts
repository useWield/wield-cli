/**
 * format.ts — output formatting: tables, colors, value formatters, JSON output.
 *
 * ANSI colors are suppressed when stdout is not a TTY (piped/redirected).
 * All JSON output goes to stdout; human messages go to stderr when --json is set.
 */

import type { Hex } from "viem";

// ---- color helpers ----

const TTY = process.stdout.isTTY ?? false;

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
} as const;

type ColorName = keyof typeof ANSI;

export const c = (() => {
  const fns: Record<string, (s: string) => string> = {};
  for (const [name, code] of Object.entries(ANSI)) {
    fns[name] = TTY ? (s: string) => `${code}${s}${ANSI.reset}` : (s: string) => s;
  }
  return fns as Record<ColorName, (s: string) => string>;
})();

export function label(text: string): string {
  return c.dim(text);
}

export function ok(text: string): string {
  return c.green(text);
}

export function warn(text: string): string {
  return c.yellow(text);
}

export function err(text: string): string {
  return c.red(text);
}

// ---- value formatters ----

export function formatUsdc(amount: bigint | number, decimals: number): string {
  const amt = typeof amount === "number" ? BigInt(Math.floor(amount)) : amount;
  const divisor = 10n ** BigInt(decimals);
  const whole = amt / divisor;
  const frac = amt % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${fracStr}`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function truncateHash(hash: string, chars = 6): string {
  if (hash.length <= chars * 2 + 5) return hash;
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

export function truncateAddress(addr: string): string {
  return truncateHash(addr, 4);
}

export function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toISOString().replace("T", " ").slice(0, 19);
  } catch {
    return ts;
  }
}

// ---- table ----

/**
 * Print an aligned table. Headers and rows are arrays of strings.
 * Uses Unicode box-drawing characters when TTY, plain pipes otherwise.
 */
export function table(headers: string[], rows: string[][]): void {
  const all = [headers, ...rows];
  const widths = headers.map((_, ci) =>
    Math.max(...all.map(r => (r[ci] ?? "").length)),
  );

  const sep = TTY ? "│" : "|";
  const pad = (s: string, w: number) => s.padEnd(w);

  // header row
  const hdr = headers.map((h, i) => c.bold(pad(h, widths[i]))).join(` ${sep} `);

  if (TTY) {
    const top = "┌" + widths.map(w => "─".repeat(w + 2)).join("┬") + "┐";
    const mid = "├" + widths.map(w => "─".repeat(w + 2)).join("┼") + "┤";
    const bot = "└" + widths.map(w => "─".repeat(w + 2)).join("┴") + "┘";
    console.log(top);
    console.log(`${sep} ${hdr} ${sep}`);
    console.log(mid);
    for (const row of rows) {
      const cells = row.map((cell, i) => pad(cell, widths[i])).join(` ${sep} `);
      console.log(`${sep} ${cells} ${sep}`);
    }
    console.log(bot);
  } else {
    const line = "-".repeat(widths.reduce((s, w) => s + w + 3, 1));
    console.log(line);
    console.log(`${sep} ${hdr} ${sep}`);
    console.log(line);
    for (const row of rows) {
      const cells = row.map((cell, i) => pad(cell, widths[i])).join(` ${sep} `);
      console.log(`${sep} ${cells} ${sep}`);
    }
    console.log(line);
  }
}

// ---- JSON output ----

export interface JsonOk {
  ok: true;
  command: string;
  data: unknown;
}

export interface JsonErr {
  ok: false;
  command: string;
  error: {
    code: string;
    message: string;
  };
}

export type JsonOutput = JsonOk | JsonErr;

export function jsonOk(command: string, data: unknown): JsonOk {
  return { ok: true, command, data };
}

export function jsonErr(command: string, error: { code: string; message: string }): JsonErr {
  return { ok: false, command, error };
}

export function printJson(out: JsonOutput, exitCode: number): never {
  console.log(JSON.stringify(out));
  process.exit(exitCode);
}

// ---- message helpers ----

let jsonMode = false;

export function setJsonMode(on: boolean): void {
  jsonMode = on;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/**
 * Log a human-readable message. Goes to stderr in JSON mode, stdout otherwise.
 */
export function log(msg: string): void {
  if (jsonMode) {
    process.stderr.write(msg + "\n");
  } else {
    console.log(msg);
  }
}

/**
 * Log without newline (for progress).
 */
export function logInline(msg: string): void {
  if (jsonMode) {
    process.stderr.write(msg);
  } else {
    process.stdout.write(msg);
  }
}
