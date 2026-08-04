import type { Address } from "viem";

export interface Allocation {
  asset: Address;
  bps: number;
}

export interface Intent {
  nonce: bigint;
  deadline: bigint;
  allocations: Allocation[];
}

export interface AssetInfo {
  address: Address;
  symbol: string;
  decimals: number;
}
