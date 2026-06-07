import { describe, expect, it } from "vitest";

import {
  applyModelCapacityEvent,
  formatCapacityRatio,
} from "@/lib/router/telemetry";
import type { ProviderOffering } from "@/lib/router/types";

const sample: ProviderOffering = {
  node_id: "0xabc",
  model_id: "qwen/qwen3.6-27b",
  tunnel_status: "online",
  context_length: 128000,
  quantization: "Q4_K_M",
  parameter_count: "27B",
  source_url: "",
  features: {},
  concurrency: 4,
  active_requests: 0,
  queued_requests: 0,
  active_sessions: 0,
  available_slots: 4,
};

describe("applyModelCapacityEvent", () => {
  it("updates matching provider load fields", () => {
    const next = applyModelCapacityEvent([sample], {
      node_id: "0xabc",
      model_id: "qwen/qwen3.6-27b",
      active_requests: 2,
      queued_requests: 1,
      concurrency: 4,
    });
    expect(next[0].active_requests).toBe(2);
    expect(next[0].queued_requests).toBe(1);
    expect(next[0].available_slots).toBe(2);
    expect(next[0].active_sessions).toBe(2);
  });
});

describe("formatCapacityRatio", () => {
  it("renders bounded concurrency", () => {
    expect(formatCapacityRatio(2, 4)).toBe("2/4");
  });

  it("renders unlimited concurrency", () => {
    expect(formatCapacityRatio(3, 0)).toBe("3/∞");
  });
});
