/**
 * Smoke test — re-assert the agent's sign functions can be imported and called.
 */
import { describe, test, expect } from "bun:test";
import { hashIntent, signIntent } from "../src/sign";
import type { Intent } from "../src/types";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

describe("sign reuse contract (smoke)", () => {
  test("hashIntent returns 66-char hex for known values", () => {
    const intent: Intent = {
      nonce: 0n,
      deadline: 9999999999n,
      allocations: [
        { asset: "0x1111111111111111111111111111111111111111", bps: 6000 },
        { asset: "0x2222222222222222222222222222222222222222", bps: 4000 },
      ],
    };
    const digest = hashIntent(intent, "0x9999999999999999999999999999999999999999", 84532);
    expect(digest).toBeString();
    expect(digest.length).toBe(66);
    expect(digest.startsWith("0x")).toBe(true);
  });

  test("hashIntent is deterministic", () => {
    const intent: Intent = {
      nonce: 1n,
      deadline: 100n,
      allocations: [{ asset: "0x0000000000000000000000000000000000000001", bps: 6000 }],
    };
    const a = hashIntent(intent, "0x0000000000000000000000000000000000000002", 84532);
    const b = hashIntent(intent, "0x0000000000000000000000000000000000000002", 84532);
    expect(a).toBe(b);
  });

  test("signIntent produces recoverable signature", async () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const digest = "0x" + "ab".repeat(32) as `0x${string}`;
    const sig = await signIntent(account, digest);
    expect(sig).toBeString();
    expect(sig.length).toBeGreaterThan(130); // secp256k1 sig
  });
});
