import type { NodeStatus, ProviderOffering } from "@/lib/router/types";

export type ModelCapacityEvent = {
  type: "model_capacity";
  node_id: string;
  model_id: string;
  active_requests: number;
  queued_requests: number;
  concurrency: number;
};

export type NodeStatusEvent = {
  type: "node_status";
  node_id: string;
  moniker?: string | null;
  status: string;
  in_flight_requests: number;
  model_count: number;
};

export type TelemetrySnapshotEvent = {
  type: "snapshot";
  nodes: Omit<NodeStatusEvent, "type">[];
  models: Omit<ModelCapacityEvent, "type">[];
};

export type TelemetryEvent =
  | ModelCapacityEvent
  | NodeStatusEvent
  | TelemetrySnapshotEvent;

export type SubscribeCredentials = {
  wsUrl: string;
  exp: number;
};

export async function fetchTelemetrySubscribe(): Promise<SubscribeCredentials> {
  const res = await fetch("/api/router-telemetry/subscribe", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: string }).error)
        : `Subscribe failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json() as Promise<SubscribeCredentials>;
}

export function applyModelCapacityEvent(
  providers: ProviderOffering[],
  event: Omit<ModelCapacityEvent, "type">,
): ProviderOffering[] {
  const nodeId = event.node_id.toLowerCase();
  let found = false;
  const next = providers.map((p) => {
    if (p.node_id.toLowerCase() !== nodeId || p.model_id !== event.model_id) {
      return p;
    }
    found = true;
    const available_slots =
      event.concurrency > 0
        ? Math.max(0, event.concurrency - event.active_requests)
        : p.available_slots;
    return {
      ...p,
      active_requests: event.active_requests,
      active_sessions: event.active_requests,
      queued_requests: event.queued_requests,
      concurrency: event.concurrency || p.concurrency,
      available_slots,
    };
  });
  return found ? next : providers;
}

export function applyNodeStatusEvent(
  nodes: NodeStatus[],
  event: Omit<NodeStatusEvent, "type">,
): NodeStatus[] {
  const nodeId = event.node_id.toLowerCase();
  const idx = nodes.findIndex((n) => n.node_id.toLowerCase() === nodeId);
  const row: NodeStatus = {
    node_id: event.node_id,
    moniker: event.moniker ?? null,
    status: event.status as NodeStatus["status"],
    connected_at: idx >= 0 ? nodes[idx].connected_at : null,
    last_pong_at: idx >= 0 ? nodes[idx].last_pong_at : null,
    uptime_secs: idx >= 0 ? nodes[idx].uptime_secs : null,
    in_flight_requests: event.in_flight_requests,
    model_count: event.model_count,
  };
  if (idx >= 0) {
    const copy = [...nodes];
    copy[idx] = row;
    return copy;
  }
  return [...nodes, row];
}

export function formatCapacityRatio(active: number, concurrency: number): string {
  if (concurrency <= 0) return `${active}/∞`;
  return `${active}/${concurrency}`;
}
