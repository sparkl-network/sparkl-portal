import { parseAbi, type Abi } from "viem";

/**
 * Flat `sessions(uint256)` return list for viem `readContract`.
 * Avoids decoding a single struct tuple (uint64 + string) which mis-parses the user
 * address as an integer on some viem versions.
 */
export const sessionsGetterAbi = parseAbi([
  "function sessions(uint256 sessionId) view returns (address user, bytes32 nodeId, bytes32 modelId, uint8 tier, uint256 lockedInternal, uint256 usageRecorded, uint256 paidToProviderInternal, uint256 paidToProtocolInternal, uint256 openingInternal, uint64 openedAt, bool settled, uint64 inputTokensRecorded, uint64 outputTokensRecorded, uint256 inputPricePer1kAtOpen, uint256 outputPricePer1kAtOpen, uint256 usdcPerDotAtOpen, bool pricingUsedDefault, string name)",
]) as Abi;

/** Pre-pricing-snapshot escrow layout (no per-field oracle snapshot on Session). */
export const sessionsGetterLegacyNoPricingAbi = parseAbi([
  "function sessions(uint256 sessionId) view returns (address user, bytes32 nodeId, bytes32 modelId, uint8 tier, uint256 lockedInternal, uint256 usageRecorded, uint256 paidToProviderInternal, uint256 paidToProtocolInternal, uint256 openingInternal, uint64 openedAt, bool settled, uint64 inputTokensRecorded, uint64 outputTokensRecorded, string name)",
]) as Abi;

export function isSessionsDecodeError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("safe integer range") ||
    msg.includes("IntegerOutOfRange") ||
    msg.includes("out of bounds")
  );
}
