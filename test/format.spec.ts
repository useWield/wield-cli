/**
 * Formatter tests.
 */
import { describe, test, expect } from "bun:test";
import { formatUsdc, formatBps, truncateHash, jsonOk, jsonErr } from "../src/format";

describe("formatUsdc", () => {
  test("formats whole dollar", () => {
    expect(formatUsdc(100_000000n, 6)).toBe("$100.00");
  });

  test("formats cents", () => {
    expect(formatUsdc(100_500000n, 6)).toBe("$100.50");
  });

  test("formats zero", () => {
    expect(formatUsdc(0n, 6)).toBe("$0.00");
  });

  test("formats large number", () => {
    expect(formatUsdc(1_234_567_890000n, 6)).toBe("$1,234,567.89");
  });
});

describe("formatBps", () => {
  test("6000 bps → 60.00%", () => {
    expect(formatBps(6000)).toBe("60.00%");
  });

  test("4000 bps → 40.00%", () => {
    expect(formatBps(4000)).toBe("40.00%");
  });
});

describe("truncateHash", () => {
  test("truncates long hash", () => {
    const hash = "0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234";
    const result = truncateHash(hash);
    expect(result).toStartWith("0xabcd");
    expect(result).toEndWith("cd1234");
    expect(result).toContain("…");
  });

  test("keeps short hash unchanged", () => {
    expect(truncateHash("0x1234")).toBe("0x1234");
  });
});

describe("json helpers", () => {
  test("jsonOk builds correct shape", () => {
    const out = jsonOk("test.cmd", { value: 1 });
    expect(out.ok).toBe(true);
    expect(out.command).toBe("test.cmd");
    expect(out.data).toEqual({ value: 1 });
  });

  test("jsonErr builds correct shape", () => {
    const out = jsonErr("test.cmd", { code: "ERR", message: "bad" });
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("ERR");
  });
});
