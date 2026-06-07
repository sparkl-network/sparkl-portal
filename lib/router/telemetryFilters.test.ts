import { describe, expect, it } from "vitest";

import {
  filterModelTelemetry,
  filterNodeTelemetry,
  isAtCapacity,
  matchesModelLoadState,
} from "@/lib/router/telemetryFilters";
import type { NodeStatus, ProviderOffering } from "@/lib/router/types";

const node: NodeStatus = {
  node_id: "0xabc123",
  moniker: "solo-alpha",
  status: "online",
  connected_at: null,
  last_pong_at: null,
  uptime_secs: 120,
  in_flight_requests: 2,
  model_count: 3,
};

const provider: ProviderOffering = {
  node_id: "0xabc123",
  model_id: "qwen/qwen3.6-27b",
  tunnel_status: "online",
  context_length: 128000,
  quantization: "Q4_K_M",
  parameter_count: "27B",
  source_url: "",
  features: {},
  concurrency: 4,
  active_requests: 4,
  queued_requests: 2,
  active_sessions: 4,
  available_slots: 0,
};

describe("filterNodeTelemetry", () => {
  it("matches moniker search", () => {
    const rows = filterNodeTelemetry([node], {
      query: "alpha",
      tunnelStatus: "",
      inFlight: "",
      hasModels: "",
      viewMode: "table",
    });
    expect(rows).toHaveLength(1);
  });

  it("filters by tunnel status and in-flight", () => {
    const rows = filterNodeTelemetry([node], {
      query: "",
      tunnelStatus: "offline",
      inFlight: "yes",
      hasModels: "",
      viewMode: "table",
    });
    expect(rows).toHaveLength(0);
  });
});

describe("filterModelTelemetry", () => {
  it("filters at-capacity rows", () => {
    expect(isAtCapacity(provider)).toBe(true);
    expect(matchesModelLoadState(provider, "has_queue")).toBe(true);
    const rows = filterModelTelemetry([provider], {
      query: "",
      tunnelStatus: "",
      loadState: "at_capacity",
      quantization: "",
      minQueued: "",
      viewMode: "table",
    });
    expect(rows).toHaveLength(1);
  });

  it("filters by min queued", () => {
    const rows = filterModelTelemetry([provider], {
      query: "",
      tunnelStatus: "",
      loadState: "",
      quantization: "",
      minQueued: "3",
      viewMode: "table",
    });
    expect(rows).toHaveLength(0);
  });
});
