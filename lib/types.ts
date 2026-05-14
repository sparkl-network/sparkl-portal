import type { Address, Hex } from "viem";

/** Mirrors `NodeLifecycle` in `contracts/src/SecurityTypes.sol`. */
export enum NodeLifecycle {
  Active = 0,
  Chilled = 1,
  Defunct = 2,
}

/** Mirrors `SecurityTier` in `contracts/src/SecurityTypes.sol`. */
export enum SecurityTier {
  BEST_EFFORT = 0,
  TEE_VERIFIED = 1,
}

/**
 * On-chain **`NodeInfo`** from `ProviderRegistry` (Solidity struct name).
 * The contract’s view is still named **`getProvider`** in the ABI; at the UI level treat this as **node** metadata (`getNode` / node info), not a separate “provider” entity.
 */
export type ProviderInfo = {
  payout: Address;
  feeBps: number;
  active: boolean;
  supportsBestEffort: boolean;
  supportsTEE: boolean;
  teeReportHash: `0x${string}`;
  /** On-chain `metadataURI`: bare HTTP(S) origin, or JSON `{"version","baseUrl",…}` — see `parseMetadataUri`. Probed paths: `/status`, `/identity`, `/v1/models`. */
  metadataURI: string;
  lifecycle: NodeLifecycle;
};

/** One registry node: **`nodeId`** + **`info`** (the on-chain `NodeInfo` shape above). */
export type RegisteredProvider = {
  nodeId: Hex;
  info: ProviderInfo;
};

/** Operator (registry `msg.sender` at registration) with aggregate node stats (off-chain derived). */
export type OperatorDirectoryEntry = {
  operator: Address;
  nodeCount: number;
  activeRegisteredNodeCount: number;
  teeCapableNodeCount: number;
};

/** One node row for an operator-account detail view (on-chain + optional pricing reads). */
export type OperatorNodeDetailRow = {
  nodeId: Hex;
  info: ProviderInfo;
  bestEffortPrice: bigint | null;
  teePrice: bigint | null;
};

/** Mirrors `SettlementEscrow.Session` public mapping getter. */
export type EscrowSession = {
  user: Address;
  nodeId: Hex;
  tier: SecurityTier;
  lockedInternal: bigint;
  usageRecorded: bigint;
  paidToProviderInternal: bigint;
  openingInternal: bigint;
  openedAt: bigint;
  settled: boolean;
};
