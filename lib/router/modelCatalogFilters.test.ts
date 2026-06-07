import { describe, expect, it } from "vitest";

import {
  filterProviderOfferings,
  providerMatchesFilters,
  DEFAULT_MODEL_CATALOG_FILTERS,
} from "@/lib/router/modelCatalogFilters";
import type { ProviderOffering } from "@/lib/router/types";

function sampleProvider(overrides: Partial<ProviderOffering> = {}): ProviderOffering {
  return {
    node_id: "0xabc",
    model_id: "qwen/qwen3.6-27b",
    tunnel_status: "online",
    context_length: 128000,
    quantization: "Q4_K_M",
    parameter_count: "27B",
    source_url: "https://huggingface.co/Qwen/Qwen3.6-27B",
    features: { mtp: "8-token" },
    concurrency: 4,
    active_requests: 0,
    queued_requests: 0,
    active_sessions: 0,
    available_slots: 4,
    ...overrides,
  };
}

describe("providerMatchesFilters", () => {
  it("matches all when filters are default", () => {
    expect(providerMatchesFilters(sampleProvider(), DEFAULT_MODEL_CATALOG_FILTERS)).toBe(true);
  });

  it("filters by quantization and min slots", () => {
    const filters = {
      ...DEFAULT_MODEL_CATALOG_FILTERS,
      quantization: "Q4_K_M",
      minAvailableSlots: "2",
    };
    expect(providerMatchesFilters(sampleProvider(), filters)).toBe(true);
    expect(
      providerMatchesFilters(sampleProvider({ quantization: "Q8_0" }), filters),
    ).toBe(false);
    expect(
      providerMatchesFilters(sampleProvider({ available_slots: 1 }), filters),
    ).toBe(false);
  });

  it("filters by feature keys and search query", () => {
    const filters = {
      ...DEFAULT_MODEL_CATALOG_FILTERS,
      featuresAny: ["mtp"],
      query: "27b",
    };
    expect(providerMatchesFilters(sampleProvider(), filters)).toBe(true);
    expect(
      providerMatchesFilters(sampleProvider({ features: {} }), filters),
    ).toBe(false);
    expect(
      providerMatchesFilters(
        sampleProvider({
          model_id: "other/model",
          parameter_count: "8B",
          features: { mtp: "8-token" },
        }),
        { ...filters, query: "gemma" },
      ),
    ).toBe(false);
  });

  it("filters online only", () => {
    const filters = { ...DEFAULT_MODEL_CATALOG_FILTERS, onlineOnly: true };
    expect(providerMatchesFilters(sampleProvider(), filters)).toBe(true);
    expect(
      providerMatchesFilters(sampleProvider({ tunnel_status: "offline" }), filters),
    ).toBe(false);
  });
});

describe("filterProviderOfferings", () => {
  it("returns subset matching filters", () => {
    const providers = [
      sampleProvider(),
      sampleProvider({ model_id: "other/model", quantization: "" }),
    ];
    const out = filterProviderOfferings(providers, {
      ...DEFAULT_MODEL_CATALOG_FILTERS,
      quantization: "Q4_K_M",
    });
    expect(out).toHaveLength(1);
    expect(out[0].model_id).toBe("qwen/qwen3.6-27b");
  });
});
