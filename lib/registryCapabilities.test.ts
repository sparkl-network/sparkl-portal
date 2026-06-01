import { describe, expect, it } from "vitest";

import { parseRegistryCapabilities } from "./registryCapabilities";

describe("parseRegistryCapabilities", () => {
  it("parses best-effort only node", () => {
    expect(
      parseRegistryCapabilities({
        peer_id: "12D3KooW…",
        registry_capabilities: {
          supports_best_effort: true,
          supports_tee: false,
          tee_report_hash: null,
        },
      }),
    ).toEqual({
      supportsBestEffort: true,
      supportsTEE: false,
      teeReportHash: null,
    });
  });

  it("parses tee_report_hash while supports_tee remains false (TEE planned)", () => {
    const hash =
      "0xace9c4b0bca8bbb95391aae412174933ba56a1784faad1acba1ff5b76ef4f34a";
    expect(
      parseRegistryCapabilities({
        registry_capabilities: {
          supports_best_effort: true,
          supports_tee: false,
          tee_report_hash: hash,
        },
      }),
    ).toEqual({
      supportsBestEffort: true,
      supportsTEE: false,
      teeReportHash: hash,
    });
  });

  it("returns null when field missing", () => {
    expect(parseRegistryCapabilities({ peer_id: "x" })).toBeNull();
  });
});
