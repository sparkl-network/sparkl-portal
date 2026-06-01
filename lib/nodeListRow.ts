import type { RegisteredNodeWithOperator } from "@/lib/evm/registry";
import { parseMetadataUri } from "@/lib/nodeBaseUrl";
import { nodeIdFromLibp2pPeerIdString, parseNodeIdInput } from "@/lib/nodeId";

export type RegisteredNodeListRow = RegisteredNodeWithOperator & {
  nodeIdString: string | null;
};

/**
 * Attach libp2p peer id strings for display from on-chain registration metadata.
 */
export function enrichRegisteredNodesWithPeerId(
  rows: RegisteredNodeWithOperator[],
): RegisteredNodeListRow[] {
  return rows.map((r) => {
    const meta = parseMetadataUri(r.info.metadataURI ?? "");
    const peerId = meta?.peerId?.trim() ?? null;
    if (peerId) {
      const hashed = nodeIdFromLibp2pPeerIdString(peerId);
      if (hashed && hashed.toLowerCase() === r.nodeId.toLowerCase()) {
        return { ...r, nodeIdString: peerId };
      }
      if (meta?.nodeId && meta.nodeId.toLowerCase() === r.nodeId.toLowerCase()) {
        return { ...r, nodeIdString: peerId };
      }
    }
    return { ...r, nodeIdString: null };
  });
}

export function nodeListDetailHref(
  row: RegisteredNodeWithOperator & { nodeIdString?: string | null },
): string {
  const peer = row.nodeIdString?.trim() ?? null;
  if (peer && parseNodeIdInput(peer)) {
    return `/node/${encodeURIComponent(peer)}`;
  }
  return `/node/${encodeURIComponent(row.nodeId)}`;
}
