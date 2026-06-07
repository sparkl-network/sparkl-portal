import { describe, expect, it } from "vitest";
import { getAddress, zeroAddress } from "viem";

import { SecurityTier, type EscrowSession } from "@/lib/types";

import {
  assertSettleFullValid,
  providerOwedInternal,
  SettleValidationError,
  suggestSettleSplit,
} from "./sessionSettle";

function session(partial: Partial<EscrowSession> & Pick<EscrowSession, "lockedInternal">): EscrowSession {
  return {
    user: getAddress(zeroAddress),
    nodeId: `0x${"ab".repeat(32)}`,
    modelId: `0x${"cd".repeat(32)}`,
    tier: SecurityTier.BEST_EFFORT,
    usageRecorded: 0n,
    paidToProviderInternal: 0n,
    paidToProtocolInternal: 0n,
    openingInternal: partial.lockedInternal,
    openedAt: 1n,
    settled: false,
    inputTokensRecorded: 0n,
    outputTokensRecorded: 0n,
    inputPricePer1kAtOpen: 0n,
    outputPricePer1kAtOpen: 0n,
    usdcPerDotAtOpen: 0n,
    pricingUsedDefault: false,
    name: "",
    ...partial,
  };
}

describe("suggestSettleSplit", () => {
  it("refunds full lock when no usage", () => {
    const s = session({ lockedInternal: 1000n, usageRecorded: 0n });
    expect(suggestSettleSplit(s)).toEqual({ toProvider: 0n, toUser: 1000n });
  });

  it("pays provider up to usage and refunds remainder", () => {
    const s = session({
      lockedInternal: 1000n,
      usageRecorded: 600n,
      paidToProviderInternal: 200n,
    });
    expect(providerOwedInternal(s)).toBe(400n);
    expect(suggestSettleSplit(s)).toEqual({ toProvider: 400n, toUser: 600n });
  });

  it("caps provider at locked when usage exceeds lock", () => {
    const s = session({
      lockedInternal: 500n,
      usageRecorded: 900n,
      paidToProviderInternal: 0n,
    });
    expect(suggestSettleSplit(s)).toEqual({ toProvider: 500n, toUser: 0n });
  });
});

describe("assertSettleFullValid", () => {
  it("accepts a draining valid split", () => {
    const s = session({ lockedInternal: 100n, usageRecorded: 40n });
    const split = suggestSettleSplit(s);
    expect(() => assertSettleFullValid(s, split.toProvider, split.toUser)).not.toThrow();
  });

  it("rejects non-draining split", () => {
    const s = session({ lockedInternal: 100n });
    expect(() => assertSettleFullValid(s, 10n, 10n)).toThrow(SettleValidationError);
  });

  it("rejects provider over usage", () => {
    const s = session({ lockedInternal: 100n, usageRecorded: 10n });
    expect(() => assertSettleFullValid(s, 50n, 50n)).toThrow(SettleValidationError);
  });
});
