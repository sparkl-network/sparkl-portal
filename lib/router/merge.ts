import { normalizeNodeId } from "@/lib/router/normalizeNodeId";
import type {
  ModelCapacityAggregate,
  NodeStatus,
  ProviderOffering,
  RouterTunnelStatus,
} from "@/lib/router/types";

export function buildStatusMap(nodes: NodeStatus[]): Map<string, NodeStatus> {
  const map = new Map<string, NodeStatus>();
  for (const n of nodes) {
    const key = normalizeNodeId(n.node_id);
    if (key) map.set(key, n);
  }
  return map;
}

export function providersForNode(
  providers: ProviderOffering[],
  nodeId: string | null | undefined,
): ProviderOffering[] {
  const key = normalizeNodeId(nodeId);
  if (!key) return [];
  return providers.filter((p) => normalizeNodeId(p.node_id) === key);
}

export function buildModelCountByNodeId(
  providers: ProviderOffering[],
): Map<string, number> {
  const distinct = new Map<string, Set<string>>();
  for (const p of providers) {
    const key = normalizeNodeId(p.node_id);
    if (!key) continue;
    let set = distinct.get(key);
    if (!set) {
      set = new Set();
      distinct.set(key, set);
    }
    set.add(p.model_id.toLowerCase());
  }
  const map = new Map<string, number>();
  for (const [key, set] of distinct) {
    map.set(key, set.size);
  }
  return map;
}

export function distinctModelCountForNode(
  providers: ProviderOffering[],
  nodeId: string | null | undefined,
): number {
  const rows = providersForNode(providers, nodeId);
  const ids = new Set(rows.map((r) => r.model_id.toLowerCase()));
  return ids.size;
}

export function groupProvidersByModelId(
  providers: ProviderOffering[],
): Map<string, ModelCapacityAggregate> {
  const byModel = new Map<string, ProviderOffering[]>();
  for (const p of providers) {
    const id = p.model_id;
    const list = byModel.get(id) ?? [];
    list.push(p);
    byModel.set(id, list);
  }

  const out = new Map<string, ModelCapacityAggregate>();
  for (const [modelId, rows] of byModel) {
    const onlineCount = rows.filter((r) => r.tunnel_status === "online").length;
    const totalAvailableSlots = rows.reduce((s, r) => s + r.available_slots, 0);
    const featureKeys = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r.features ?? {})) featureKeys.add(k);
    }
    const onlineSample = rows.find((r) => r.tunnel_status === "online") ?? rows[0];
    out.set(modelId, {
      modelId,
      providers: rows,
      onlineCount,
      totalAvailableSlots,
      featureKeys: [...featureKeys].sort(),
      sampleQuantization: onlineSample?.quantization || null,
    });
  }
  return out;
}

export function routerModelCountForNode(
  status: NodeStatus | undefined,
  providers: ProviderOffering[],
  nodeId: string | null | undefined,
): number | null {
  if (status && status.model_count > 0) return status.model_count;
  const catalogCount = distinctModelCountForNode(providers, nodeId);
  return catalogCount > 0 ? catalogCount : status?.model_count ?? null;
}

export function isTunnelHealthy(status: RouterTunnelStatus | undefined): boolean {
  return status === "online";
}
