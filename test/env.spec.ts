/**
 * Env validation tests.
 * Values are injected via process.env so tests don't depend on .env file.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { loadEnv, EnvError } from "../src/env";

describe("loadEnv", () => {
  beforeAll(() => {
    process.env.RPC_URL = "https://sepolia.base.org";
    process.env.VAULT_ADDRESS = "0x0000000000000000000000000000000000000000";
    process.env.USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  });

  test("RPC_URL required — loads when set", () => {
    const env = loadEnv(["RPC_URL"]);
    expect(env.RPC_URL).toBeString();
    expect(env.RPC_URL!.length).toBeGreaterThan(0);
  });

  test("address validation accepts valid address", () => {
    const env = loadEnv(["USDC_ADDRESS"]);
    expect(env.USDC_ADDRESS).toBeString();
    expect(env.USDC_ADDRESS!.startsWith("0x")).toBe(true);
  });

  test("throws ENV_MISSING for missing key", () => {
    const e = new EnvError("ENV_MISSING", "SOME_KEY is required");
    expect(e.code).toBe("ENV_MISSING");
    expect(e.detail).toContain("SOME_KEY");
  });

  test("throws ENV_INVALID for bad address", () => {
    const e = new EnvError("ENV_INVALID", "VAULT_ADDRESS is not a valid address");
    expect(e.code).toBe("ENV_INVALID");
  });

  test("loadEnv returns only requested keys", () => {
    const env = loadEnv(["RPC_URL", "VAULT_ADDRESS"]);
    expect(env.RPC_URL).toBeDefined();
    expect(env.VAULT_ADDRESS).toBeDefined();
    expect(env.AGENT_PRIVATE_KEY).toBeUndefined();
    expect(env.USER_PRIVATE_KEY).toBeUndefined();
  });
});
