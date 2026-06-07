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
 * ABI view is still **`getNode`**; portal code uses {@link getNode}.
 */
export type NodeInfo = {
  payout: Address;
  feeBps: number;
  active: boolean;
  supportsBestEffort: boolean;
  supportsTEE: boolean;
  teeReportHash: `0x${string}`;
  /** On-chain `metadataURI` (MVP: empty at register); legacy rows may have HTTP/JSON — see `parseMetadataUri`. */
  metadataURI: string;
  lifecycle: NodeLifecycle;
};

/** One registry node: **`nodeId`** + on-chain **`NodeInfo`**. */
export type RegisteredNode = {
  nodeId: Hex;
  info: NodeInfo;
};

/** Operator (registry `msg.sender` at registration) with aggregate node stats (off-chain derived). */
export type OperatorDirectoryEntry = {
  operator: Address;
  nodeCount: number;
  activeRegisteredNodeCount: number;
  teeCapableNodeCount: number;
};

/** One node row for an operator-account detail view. */
export type OperatorNodeDetailRow = {
  nodeId: Hex;
  info: NodeInfo;
};

/** Mirrors `SettlementEscrow.Session` public mapping getter. */
export type EscrowSession = {
  user: Address;
  nodeId: Hex;
  modelId: Hex;
  tier: SecurityTier;
  lockedInternal: bigint;
  usageRecorded: bigint;
  paidToProviderInternal: bigint;
  paidToProtocolInternal: bigint;
  openingInternal: bigint;
  openedAt: bigint;
  settled: boolean;
  inputTokensRecorded: bigint;
  outputTokensRecorded: bigint;
  /** ModelPriceOracle per-1k input rate snapshotted at `openSession` (0 = legacy session). */
  inputPricePer1kAtOpen: bigint;
  /** ModelPriceOracle per-1k output rate snapshotted at `openSession`. */
  outputPricePer1kAtOpen: bigint;
  /** `priceOracle.getUsdcPerDot()` at `openSession` (USDC 6-dec per 1e18 internal DOT). */
  usdcPerDotAtOpen: bigint;
  /** True when `getEffectivePrice` used the oracle default at open. */
  pricingUsedDefault: boolean;
  /** Optional user label from `openSession` (max 128 bytes on-chain). */
  name: string;
};

/** On-chain ModelPriceOracle.prices entry (internal 18-dec DOT units per 1k tokens). */
export type ModelPrice = {
  inputPer1kTokens: bigint;
  outputPer1kTokens: bigint;
  updatedAt: bigint;
  active: boolean;
};

/** Active model listed on `ModelPriceOracle` (portal /models, session `openSession`). */
export type NetworkModel = {
  modelId: Hex;
  /** Human-readable model key (e.g. `llama3:8b`). */
  name: string;
  price: ModelPrice;
};

/** @deprecated Use {@link NetworkModel}. */
export type NetworkModelPrice = NetworkModel;
