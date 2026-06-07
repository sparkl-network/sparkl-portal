import { describe, expect, it } from "vitest";
import { getEventSelector } from "viem";

import { sessionOpenedEvent } from "@/lib/evm/escrow";

describe("sessionOpenedEvent", () => {
  it("matches on-chain SessionOpened topic from pricing-snapshot escrow", () => {
    const selector = getEventSelector(sessionOpenedEvent);
    expect(selector).toBe(
      "0xf00f68e797fa960f399baa89de8b27a6cbdfcb3bf3dc588fe00cd93d7200ff3a",
    );
  });
});
