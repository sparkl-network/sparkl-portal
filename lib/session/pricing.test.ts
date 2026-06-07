import { describe, expect, it } from "vitest";

import { SecurityTier, type EscrowSession } from "@/lib/types";

import {
  formatMoneyLine,
  internalDotToUsdc,
  remainingInLock,
  sessionPricing,
  tokenCostAtOpenRates,
} from "./pricing";

function baseSession(partial: Partial<EscrowSession>): EscrowSession {
  return {
    user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    nodeId: "0x00",
    modelId: "0x00",
    tier: SecurityTier.BEST_EFFORT,
    lockedInternal: 500000000000000000n,
    usageRecorded: 354000000000000n,
    paidToProviderInternal: 0n,
    paidToProtocolInternal: 0n,
    openingInternal: 500000000000000000n,
    openedAt: 0n,
    settled: false,
    inputTokensRecorded: 0n,
    outputTokensRecorded: 950n,
    inputPricePer1kAtOpen: 0n,
    outputPricePer1kAtOpen: 372105263157894n,
    usdcPerDotAtOpen: 1_340_000n,
    pricingUsedDefault: false,
    name: "test4",
    ...partial,
  };
}

describe("sessionPricing", () => {
  it("returns null for legacy zero snapshot", () => {
    expect(sessionPricing(baseSession({ inputPricePer1kAtOpen: 0n, outputPricePer1kAtOpen: 0n, usdcPerDotAtOpen: 0n }))).toBeNull();
  });

  it("returns snapshot when any pricing field is non-zero", () => {
    const p = sessionPricing(baseSession({}));
    expect(p).not.toBeNull();
    expect(p?.legacy).toBe(false);
    expect(p?.outputPricePer1k).toBe(372105263157894n);
  });
});

describe("tokenCostAtOpenRates", () => {
  it("matches session-0-like 950 output tokens", () => {
    const pricing = sessionPricing(baseSession({}))!;
    const cost = tokenCostAtOpenRates(0n, 950n, pricing, SecurityTier.BEST_EFFORT, 15_000n);
    expect(cost).toBe(353499999999999n);
  });
});

describe("internalDotToUsdc", () => {
  it("converts usage to USDC smallest units", () => {
    expect(internalDotToUsdc(354000000000000n, 1_340_000n)).toBe(474n);
  });
});

describe("remainingInLock", () => {
  it("subtracts usage from locked", () => {
    const s = baseSession({});
    expect(remainingInLock(s)).toBe(500000000000000000n - 354000000000000n);
  });
});

describe("formatMoneyLine", () => {
  it("formats dot and usd", () => {
    const line = formatMoneyLine(354000000000000n, 1_340_000n);
    expect(line.dot).toContain("DOT");
    expect(line.usd).toMatch(/^\$/);
  });
});
