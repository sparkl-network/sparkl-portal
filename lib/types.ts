import type { Address } from "viem";

/** Mirrors `SecurityTier` in `contracts/src/SecurityTypes.sol`. */
export enum SecurityTier {
  BEST_EFFORT = 0,
  TEE_VERIFIED = 1,
}

/** Mirrors `ProviderInfo` struct return from `ProviderRegistry.getProvider`. */
export type ProviderInfo = {
  payout: Address;
  feeBps: number;
  active: boolean;
  supportsBestEffort: boolean;
  supportsTEE: boolean;
  teeReportHash: `0x${string}`;
};

/** Registered provider row (registry mapping key + struct). */
export type RegisteredProvider = {
  address: Address;
  info: ProviderInfo;
};

/** Mirrors `SettlementEscrow.Session` public mapping getter. */
export type EscrowSession = {
  user: Address;
  provider: Address;
  tier: SecurityTier;
  lockedInternal: bigint;
  usageRecorded: bigint;
  paidToProviderInternal: bigint;
  openingInternal: bigint;
  openedAt: bigint;
  settled: boolean;
};
