import type { RegisteredNodeWithOperator } from "@/lib/evm/registry";
import { metadataUriToBaseUrl } from "@/lib/nodeBaseUrl";

export type RegisteredNodeListRow = RegisteredNodeWithOperator & {
  nodeIdString: string | null;
};

const PEER_ID_FETCH_CONCURRENCY = 8;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      if (i >= items.length) return;
      next += 1;
      out[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Resolve libp2p peer id strings from each node's **`GET /identity`** when
 * **`identity.node_id`** matches the on-chain **`bytes32`** (Hub EVM: keccak256(ed25519 pubkey)).
 */
export async function enrichRegisteredNodesWithPeerId(
  rows: RegisteredNodeWithOperator[],
): Promise<RegisteredNodeListRow[]> {
  return mapPool(rows, PEER_ID_FETCH_CONCURRENCY, async (r) => {
    const base = metadataUriToBaseUrl(r.info.metadataURI ?? "");
    if (!base) {
      return { ...r, nodeIdString: null };
    }
    try {
      const res = await fetch(
        `/api/node-peer-id?baseUrl=${encodeURIComponent(base)}`,
      );
      if (!res.ok) {
        return { ...r, nodeIdString: null };
      }
      const data = (await res.json()) as {
        peerId?: string | null;
        nodeId?: string | null;
      };
      const peerId =
        typeof data.peerId === "string" ? data.peerId.trim() : null;
      const nodeId =
        typeof data.nodeId === "string" ? data.nodeId.trim() : null;
      if (!peerId || !nodeId) {
        return { ...r, nodeIdString: null };
      }
      if (nodeId.toLowerCase() === r.nodeId.toLowerCase()) {
        return { ...r, nodeIdString: peerId };
      }
      return { ...r, nodeIdString: null };
    } catch {
      return { ...r, nodeIdString: null };
    }
  });
}

export function nodeListDetailHref(
  row: RegisteredNodeWithOperator & { nodeIdString?: string | null },
): string {
  const peer = row.nodeIdString ?? null;
  if (peer) {
    return `/node/${encodeURIComponent(peer)}`;
  }
  return `/node/${encodeURIComponent(row.nodeId)}`;
}
