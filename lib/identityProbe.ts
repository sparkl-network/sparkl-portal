import type { Hex } from "viem";

import { nodeIdFromLibp2pPeerIdString } from "@/lib/nodeId";

/** `GET /identity` JSON: `node_id` field (`0x` + 64 hex) when present. */
export function parseIdentityNodeId(body: unknown): Hex | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as Record<string, unknown>).node_id;
  if (typeof id !== "string") return null;
  const s = id.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(s)) return null;
  return s.toLowerCase() as Hex;
}

export function parseIdentityPeerId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const p = (body as Record<string, unknown>).peer_id;
  return typeof p === "string" ? p.trim() : null;
}

/**
 * Canonical registration id from `GET /identity`: libp2p `peer_id` → `bytes32`
 * (`keccak256(multihash)`). Rejects bodies where `node_id` disagrees with that hash.
 */
export function canonicalNodeIdFromIdentityBody(body: unknown): {
  peerId: string;
  nodeId: Hex;
} | null {
  const peerId = parseIdentityPeerId(body);
  if (!peerId) return null;
  const nodeId = nodeIdFromLibp2pPeerIdString(peerId);
  if (!nodeId) return null;
  const fromBody = parseIdentityNodeId(body);
  if (fromBody && fromBody.toLowerCase() !== nodeId.toLowerCase()) {
    return null;
  }
  return { peerId, nodeId };
}
