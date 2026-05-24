import type { Hex } from "viem";

/** `GET /identity` JSON: canonical Hub EVM bytes32 as hex (sparkl-solo `identity::on_chain_node_id_hex`). */
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
