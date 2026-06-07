import { describe, expect, it } from "vitest";

import {
  buildModelCountByNodeId,
  buildStatusMap,
  groupProvidersByModelId,
  isTunnelHealthy,
  providersForNode,
} from "./merge";
import type { NodeStatus, ProviderOffering } from "./types";

const NODE_A =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NODE_B =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function offering(
  nodeId: string,
  modelId: string,
  tunnelStatus = "online",
): ProviderOffering {
  return {
    node_id: nodeId,
    model_id: modelId,
    tunnel_status: tunnelStatus,
    context_length: 8192,
    quantization: "Q4",
    parameter_count: "7B",
    source_url: "",
    features: { mtp: "draft" },
    concurrency: 4,
    active_requests: 1,
    queued_requests: 0,
    active_sessions: 1,
    available_slots: 3,
  };
}

describe("normalizeNodeId via buildStatusMap", () => {
  it("keys status by canonical node id", () => {
    const nodes: NodeStatus[] = [
      {
        node_id: NODE_A,
        status: "online",
        connected_at: null,
        last_pong_at: null,
        uptime_secs: 10,
        in_flight_requests: 0,
        model_count: 2,
      },
    ];
    const map = buildStatusMap(nodes);
    expect(map.get(NODE_A)?.status).toBe("online");
  });
});

describe("groupProvidersByModelId", () => {
  it("aggregates providers per model", () => {
    const providers = [
      offering(NODE_A, "model-x"),
      offering(NODE_B, "model-x"),
      offering(NODE_A, "model-y"),
    ];
    const grouped = groupProvidersByModelId(providers);
    expect(grouped.get("model-x")?.providers).toHaveLength(2);
    expect(grouped.get("model-x")?.onlineCount).toBe(2);
    expect(grouped.get("model-x")?.totalAvailableSlots).toBe(6);
    expect(grouped.get("model-y")?.providers).toHaveLength(1);
  });
});

describe("providersForNode", () => {
  it("filters by node id", () => {
    const providers = [offering(NODE_A, "m1"), offering(NODE_B, "m2")];
    expect(providersForNode(providers, NODE_A)).toHaveLength(1);
    expect(providersForNode(providers, NODE_A)[0]?.model_id).toBe("m1");
  });
});

describe("buildModelCountByNodeId", () => {
  it("counts distinct models per node", () => {
    const providers = [
      offering(NODE_A, "m1"),
      offering(NODE_A, "m2"),
      offering(NODE_A, "m1"),
    ];
    const map = buildModelCountByNodeId(providers);
    expect(map.get(NODE_A)).toBe(2);
  });
});

describe("isTunnelHealthy", () => {
  it("only online is healthy", () => {
    expect(isTunnelHealthy("online")).toBe(true);
    expect(isTunnelHealthy("degraded")).toBe(false);
    expect(isTunnelHealthy("offline")).toBe(false);
    expect(isTunnelHealthy(undefined)).toBe(false);
  });
});
