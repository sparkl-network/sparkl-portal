import { describe, expect, it } from "vitest";
import { getAddress } from "viem";

import { SecurityTier } from "@/lib/types";

import { normalizeSession } from "./escrow";

/** Tuple shape from `sessions(uint256)` on current SettlementEscrow (includes paidToProtocolInternal). */
const SESSION_0_TUPLE = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x877f5a2d994b90eaaf84250d4898ab049539460eeecb2614216526d4cefd2ed8",
  "0x19901b5106ee310093b779e131891ec328afec79c93bff6c3872832f6156ba31",
  0,
  500000000000000000n,
  0n,
  0n,
  0n,
  500000000000000000n,
  1780569747n,
  false,
  0n,
  0n,
  0n,
  0n,
  0n,
  false,
  "test4",
] as const;

describe("normalizeSession", () => {
  it("maps sessions getter tuple with paidToProtocolInternal", () => {
    const s = normalizeSession([...SESSION_0_TUPLE]);
    expect(s.user).toBe(getAddress(SESSION_0_TUPLE[0]));
    expect(s.lockedInternal).toBe(500000000000000000n);
    expect(s.openingInternal).toBe(500000000000000000n);
    expect(s.paidToProtocolInternal).toBe(0n);
    expect(s.openedAt).toBe(1780569747n);
    expect(s.settled).toBe(false);
    expect(s.name).toBe("test4");
    expect(s.tier).toBe(SecurityTier.BEST_EFFORT);
    expect(s.inputPricePer1kAtOpen).toBe(0n);
    expect(s.pricingUsedDefault).toBe(false);
  });

  it("maps legacy 14-field tuple without pricing snapshot", () => {
    const legacy = [...SESSION_0_TUPLE.slice(0, 13), SESSION_0_TUPLE[17]];
    const s = normalizeSession(legacy);
    expect(s.name).toBe("test4");
    expect(s.inputPricePer1kAtOpen).toBe(0n);
    expect(s.paidToProviderInternal).toBe(0n);
  });

  it("maps named struct from viem readContract", () => {
    const s = normalizeSession({
      user: SESSION_0_TUPLE[0],
      nodeId: SESSION_0_TUPLE[1],
      modelId: SESSION_0_TUPLE[2],
      tier: SESSION_0_TUPLE[3],
      lockedInternal: SESSION_0_TUPLE[4],
      usageRecorded: SESSION_0_TUPLE[5],
      paidToProviderInternal: SESSION_0_TUPLE[6],
      paidToProtocolInternal: SESSION_0_TUPLE[7],
      openingInternal: SESSION_0_TUPLE[8],
      openedAt: SESSION_0_TUPLE[9],
      settled: SESSION_0_TUPLE[10],
      inputTokensRecorded: SESSION_0_TUPLE[11],
      outputTokensRecorded: SESSION_0_TUPLE[12],
      inputPricePer1kAtOpen: SESSION_0_TUPLE[13],
      outputPricePer1kAtOpen: SESSION_0_TUPLE[14],
      usdcPerDotAtOpen: SESSION_0_TUPLE[15],
      pricingUsedDefault: SESSION_0_TUPLE[16],
      name: SESSION_0_TUPLE[17],
    });
    expect(s.settled).toBe(false);
    expect(s.lockedInternal).toBe(500000000000000000n);
  });
});
