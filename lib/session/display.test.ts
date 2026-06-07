import { describe, expect, it } from "vitest";

import {
  modelPageHref,
  nodePageHref,
  sessionDetailHref,
  sessionStatusLabel,
} from "@/lib/session/display";
import { SecurityTier, type EscrowSession } from "@/lib/types";

function session(partial: Partial<EscrowSession>): EscrowSession {
  return {
    user: "0x0000000000000000000000000000000000000001",
    nodeId: ("0x" + "ab".repeat(32)) as `0x${string}`,
    modelId: ("0x" + "cd".repeat(32)) as `0x${string}`,
    tier: SecurityTier.BEST_EFFORT,
    lockedInternal: 0n,
    usageRecorded: 0n,
    paidToProviderInternal: 0n,
    paidToProtocolInternal: 0n,
    openingInternal: 0n,
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

describe("sessionDetailHref", () => {
  it("builds path under base", () => {
    expect(sessionDetailHref("/user/session", 42n)).toBe("/user/session/42");
  });
});

describe("entity page hrefs", () => {
  it("builds node page path", () => {
    const nodeId = `0x${"ab".repeat(32)}`;
    expect(nodePageHref(nodeId)).toBe(`/node/${encodeURIComponent(nodeId)}`);
  });

  it("builds model page path with lowercase id", () => {
    const modelId = `0x${"CD".repeat(32)}`;
    expect(modelPageHref(modelId)).toBe(
      `/model?modelId=${encodeURIComponent(modelId.toLowerCase())}`,
    );
  });
});

describe("sessionStatusLabel", () => {
  it("labels settled sessions", () => {
    expect(sessionStatusLabel(session({ settled: true }))).toBe("Settled");
  });

  it("labels open sessions", () => {
    expect(sessionStatusLabel(session({ lockedInternal: 100n }))).toBe("Open");
  });
});
