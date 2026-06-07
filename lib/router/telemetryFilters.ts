import type { NodeStatus, ProviderOffering, RouterTunnelStatus } from "@/lib/router/types";

export type TelemetryViewMode = "table" | "list";

export type NodeTelemetryFilterState = {
  query: string;
  tunnelStatus: "" | RouterTunnelStatus;
  inFlight: "" | "yes" | "no";
  hasModels: "" | "yes" | "no";
  viewMode: TelemetryViewMode;
};

export type ModelLoadFilter = "" | "at_capacity" | "has_queue" | "has_slots" | "idle";

export type ModelTelemetryFilterState = {
  query: string;
  tunnelStatus: string;
  loadState: ModelLoadFilter;
  quantization: string;
  minQueued: string;
  viewMode: TelemetryViewMode;
};

export const DEFAULT_NODE_TELEMETRY_FILTERS: NodeTelemetryFilterState = {
  query: "",
  tunnelStatus: "",
  inFlight: "",
  hasModels: "",
  viewMode: "table",
};

export const DEFAULT_MODEL_TELEMETRY_FILTERS: ModelTelemetryFilterState = {
  query: "",
  tunnelStatus: "",
  loadState: "",
  quantization: "",
  minQueued: "",
  viewMode: "table",
};

function parseOptionalNonNegativeInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function nodeSearchHaystack(node: NodeStatus): string {
  return [node.node_id, node.moniker ?? ""].join(" ").toLowerCase();
}

export function providerSearchHaystack(p: ProviderOffering): string {
  return [
    p.node_id,
    p.model_id,
    p.quantization,
    p.parameter_count,
    p.tunnel_status,
  ]
    .join(" ")
    .toLowerCase();
}

export function isAtCapacity(p: ProviderOffering): boolean {
  return p.concurrency > 0 && p.active_requests >= p.concurrency;
}

export function matchesModelLoadState(
  p: ProviderOffering,
  loadState: ModelLoadFilter,
): boolean {
  if (!loadState) return true;
  switch (loadState) {
    case "at_capacity":
      return isAtCapacity(p);
    case "has_queue":
      return p.queued_requests > 0;
    case "has_slots":
      return p.available_slots > 0;
    case "idle":
      return p.active_requests === 0 && p.queued_requests === 0;
    default:
      return true;
  }
}

export function filterNodeTelemetry(
  nodes: NodeStatus[],
  filters: NodeTelemetryFilterState,
): NodeStatus[] {
  const q = filters.query.trim().toLowerCase();
  return nodes.filter((node) => {
    if (q && !nodeSearchHaystack(node).includes(q)) return false;
    if (filters.tunnelStatus && node.status !== filters.tunnelStatus) return false;
    if (filters.inFlight === "yes" && node.in_flight_requests <= 0) return false;
    if (filters.inFlight === "no" && node.in_flight_requests > 0) return false;
    if (filters.hasModels === "yes" && node.model_count <= 0) return false;
    if (filters.hasModels === "no" && node.model_count > 0) return false;
    return true;
  });
}

export function filterModelTelemetry(
  providers: ProviderOffering[],
  filters: ModelTelemetryFilterState,
): ProviderOffering[] {
  const q = filters.query.trim().toLowerCase();
  const minQueued = parseOptionalNonNegativeInt(filters.minQueued);
  return providers.filter((p) => {
    if (q && !providerSearchHaystack(p).includes(q)) return false;
    if (filters.tunnelStatus && p.tunnel_status !== filters.tunnelStatus) return false;
    if (!matchesModelLoadState(p, filters.loadState)) return false;
    if (filters.quantization && p.quantization !== filters.quantization) return false;
    if (minQueued != null && p.queued_requests < minQueued) return false;
    return true;
  });
}

export function buildModelTelemetryFacets(providers: ProviderOffering[]): {
  tunnelStatuses: string[];
  quantizations: string[];
} {
  const tunnelStatuses = new Set<string>();
  const quantizations = new Set<string>();
  for (const p of providers) {
    if (p.tunnel_status) tunnelStatuses.add(p.tunnel_status);
    if (p.quantization) quantizations.add(p.quantization);
  }
  return {
    tunnelStatuses: [...tunnelStatuses].sort(),
    quantizations: [...quantizations].sort(),
  };
}

export function nodeFiltersAreActive(filters: NodeTelemetryFilterState): boolean {
  return Boolean(
    filters.query.trim() ||
      filters.tunnelStatus ||
      filters.inFlight ||
      filters.hasModels,
  );
}

export function modelFiltersAreActive(filters: ModelTelemetryFilterState): boolean {
  return Boolean(
    filters.query.trim() ||
      filters.tunnelStatus ||
      filters.loadState ||
      filters.quantization ||
      filters.minQueued.trim(),
  );
}
