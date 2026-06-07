import type { RegisteredNodeWithOperator } from "@/lib/evm/registry";
import { softwarePeerIdFromMetadataUri } from "@/lib/nodeBaseUrl";
import { normalizeNodeId } from "@/lib/router/normalizeNodeId";
import type { NodeStatus } from "@/lib/router/types";

export type RegisteredNodeListRow = RegisteredNodeWithOperator & {
  /** Human-readable label from sparkl-solo via router tunnel status (not on-chain). */
  moniker?: string | null;
  /** Libp2p peer id string for display when known (optional on-chain metadataURI). */
  nodeIdString?: string | null;
};

/** Enrich directory rows with peer id from legacy `metadataURI` JSON. */
export function enrichRegisteredNodesWithPeerId(
  rows: RegisteredNodeWithOperator[],
): RegisteredNodeListRow[] {
  return rows.map((row) => {
    const peerId = softwarePeerIdFromMetadataUri(row.info.metadataURI ?? "");
    return {
      ...row,
      moniker: null,
      nodeIdString: peerId ?? null,
    };
  });
}

/** Attach live monikers from router `GET /status/nodes` (sparkl-solo `[node].moniker`). */
export function mergeRouterMoniker(
  rows: RegisteredNodeListRow[],
  statusByNodeId: Map<string, NodeStatus>,
): RegisteredNodeListRow[] {
  return rows.map((r) => {
    const key = normalizeNodeId(r.nodeId);
    const routerMoniker = key ? statusByNodeId.get(key)?.moniker?.trim() : undefined;
    if (!routerMoniker) return r;
    return { ...r, moniker: routerMoniker };
  });
}

export function nodeListDetailHref(row: RegisteredNodeWithOperator): string {
  return `/node/${encodeURIComponent(row.nodeId)}`;
}
