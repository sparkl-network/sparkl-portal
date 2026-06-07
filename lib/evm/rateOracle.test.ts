import { describe, expect, it } from "vitest";

import {
  RATE_TOO_STALE_SELECTOR,
  formatRateTooStaleHelp,
  isRateTooStaleError,
} from "@/lib/evm/rateOracle";

describe("rateOracle", () => {
  it("recognises RateTooStale selector", () => {
    expect(
      isRateTooStaleError(
        new Error(`reverted with signature ${RATE_TOO_STALE_SELECTOR}`),
      ),
    ).toBe(true);
  });

  it("includes local oracle guidance", () => {
    const help = formatRateTooStaleHelp("assethub-dev-stub");
    expect(help).toContain("sparkl-oracle-rates");
    expect(help).toContain("746268656716417910");
  });
});
