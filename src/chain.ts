/**
 * chain.ts — factory functions for viem clients.
 * No top-level side effects. Each call creates a fresh instance.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const robinhoodChain = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Robinhood Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  testnet: false,
} as const satisfies Chain;

export function makePublicClient(rpcUrl: string) {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(rpcUrl),
  });
}

export function makeWalletClient(rpcUrl: string, privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: robinhoodChain,
    transport: http(rpcUrl),
  });
}

export function senderAddress(privateKey: Hex) {
  return privateKeyToAccount(privateKey).address;
}
