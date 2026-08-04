import {
  encodeAbiParameters,
  keccak256,
  encodePacked,
  type Address,
  type Hex,
} from "viem";
import type { LocalAccount } from "viem/accounts";
import type { Intent } from "./types";

/// @notice Compute the digest signed by the agent. Must match Vault._hashIntent.
export function hashIntent(intent: Intent, vault: Address, chainId: number): Hex {
  let packed: Hex = "0x";
  for (const a of intent.allocations) {
    const seg = encodePacked(["address", "uint16"], [a.asset, a.bps]);
    packed = (packed === "0x"
      ? seg
      : ((packed + seg.slice(2)) as Hex));
  }
  const allocsHash = keccak256(packed);
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" }, // chainId
        { type: "address" }, // vault
        { type: "uint256" }, // nonce
        { type: "uint64" },  // deadline
        { type: "bytes32" }, // allocsHash
      ],
      [BigInt(chainId), vault, intent.nonce, intent.deadline, allocsHash],
    ),
  );
}

export async function signIntent(account: LocalAccount, digest: Hex): Promise<Hex> {
  return account.signMessage({ message: { raw: digest } });
}
