/**
 * Smoke test — re-assert the agent's strategy functions can be imported and called.
 */
import { describe, test, expect } from "bun:test";
import { pickAllocation, type ApySample } from "../src/strategy";

describe("strategy reuse contract (smoke)", () => {
  test("empty samples → empty allocation", () => {
    expect(pickAllocation([])).toEqual([]);
  });

  test("single asset gets 6000 bps cap", () => {
    const samples: ApySample[] = [
      { address: "0xAAA0000000000000000000000000000000000000", apyBps: 5000 },
    ];
    const result = pickAllocation(samples);
    expect(result).toHaveLength(1);
    expect(result[0].bps).toBe(6000);
  });

  test("two assets: top gets 6000, second gets 4000", () => {
    const samples: ApySample[] = [
      { address: "0xAAA0000000000000000000000000000000000000", apyBps: 3000 },
      { address: "0xBBB0000000000000000000000000000000000000", apyBps: 8000 },
    ];
    const result = pickAllocation(samples);
    expect(result).toHaveLength(2);
    // sorted by APY desc
    expect(result[0].asset).toBe("0xBBB0000000000000000000000000000000000000");
    expect(result[0].bps).toBe(6000);
    expect(result[1].asset).toBe("0xAAA0000000000000000000000000000000000000");
    expect(result[1].bps).toBe(4000);
  });
});
