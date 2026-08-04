import type { Address } from "viem";
import type { Allocation } from "./types";

export interface ApySample {
  address: Address;
  apyBps: number;
}

const MAX_BPS_PER_ASSET = 6000;
const TOTAL_BPS = 10000;

/// Pure max-APY allocator. Two-asset case: top gets 60%, second gets 40%.
/// Single-asset case: applies cap, leaves rest idle.
export function pickAllocation(samples: ApySample[]): Allocation[] {
  if (samples.length === 0) return [];
  const sorted = [...samples].sort((a, b) => b.apyBps - a.apyBps);

  if (sorted.length === 1) {
    return [{ asset: sorted[0].address, bps: MAX_BPS_PER_ASSET }];
  }

  const top = MAX_BPS_PER_ASSET;
  const rest = TOTAL_BPS - top;
  return [
    { asset: sorted[0].address, bps: top },
    { asset: sorted[1].address, bps: rest },
  ];
}
