import {
  type Address,
  type Hex,
  bytesToHex,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  padHex,
  size,
} from "viem";

/** Canonical `bytes32` node key (e.g. Substrate PeerId hash on chain). */
export type NodeId = Hex;

export type NodeIdInputKind =
  | "peer_id"
  | "hex32"
  | "address"
  | "invalid";

/** sparkl-solo software/mock TPM peer id (`mock-<hex>`), not a libp2p base58 peer id. */
export function isMockSoftwarePeerId(s: string): boolean {
  const t = s.trim();
  return /^mock-[0-9a-f]{8,64}$/i.test(t);
}

/** Bitcoin / libp2p base58 alphabet (no 0, O, I, l). */
const BASE58 =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Decode a base58btc string (e.g. libp2p peer id encoding) to raw bytes.
 */
function base58DecodeToBytes(s: string): Uint8Array | null {
  if (!s || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) return null;
  const digits: number[] = [0];
  for (let i = 0; i < s.length; i += 1) {
    const v = BASE58.indexOf(s[i]!);
    if (v < 0) return null;
    let carry = v;
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j]! * 58;
      digits[j] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      digits.push(carry & 255);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (let i = 0; i < s.length && s[i] === "1"; i += 1) {
    leadingZeros += 1;
  }
  const out = new Uint8Array(leadingZeros + digits.length);
  for (let i = 0; i < digits.length; i += 1) {
    out[out.length - 1 - i] = digits[i]!;
  }
  return out;
}

function looksLikeBase58Libp2pPeerId(s: string): boolean {
  if (s.length < 40 || s.length > 100) return false;
  // Libp2p peer id string form for common key types (e.g. ed25519) uses this prefix.
  if (!s.startsWith("12D3")) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

/**
 * Map libp2p `PeerId` string (base58 multihash) to a `bytes32` for ProviderRegistry.
 * Uses Keccak-256 over the decoded multihash bytes (stable binary form), same as
 * `keccak256(peer_id.to_bytes())`-style tooling on EVM.
 */
export function nodeIdFromLibp2pPeerIdString(peerId: string): Hex | null {
  const trimmed = peerId.trim();
  const multibase = trimmed.startsWith("z") ? trimmed.slice(1) : trimmed;
  if (!looksLikeBase58Libp2pPeerId(multibase)) return null;
  const decoded = base58DecodeToBytes(multibase);
  if (!decoded || decoded.length < 2) return null;
  return keccak256(bytesToHex(decoded));
}

/**
 * Parse UI or env input: full 32-byte hex, EVM address (padded to `bytes32`), or
 * a libp2p peer id string (`12D3Koo…` / optional multibase `z` prefix).
 */
export function parseNodeIdInput(raw: string): NodeId | null {
  const s = raw.trim();
  if (!s) return null;
  if (isHex(s) && size(s) === 32) return s;
  if (isAddress(s)) {
    try {
      return padHex(getAddress(s), { size: 32 });
    } catch {
      return null;
    }
  }
  return nodeIdFromLibp2pPeerIdString(s);
}

/** Value for the registration peer-id field from identity (libp2p `12D3Koo…`). */
export function identityInputFromProbe(params: {
  canonicalNodeId: Hex;
  identityPeerId: string | null;
}): string {
  const peer = params.identityPeerId?.trim();
  if (peer && nodeIdFromLibp2pPeerIdString(peer)) {
    return peer.startsWith("z") ? peer.slice(1) : peer;
  }
  return params.canonicalNodeId;
}

/** How the user’s input was interpreted for {@link parseNodeIdInput}. */
export function classifyNodeIdInput(raw: string): {
  kind: NodeIdInputKind;
  nodeId: NodeId | null;
} {
  const s = raw.trim();
  if (!s) return { kind: "invalid", nodeId: null };
  const nodeId = parseNodeIdInput(raw);
  if (!nodeId) return { kind: "invalid", nodeId: null };
  if (isHex(s) && size(s) === 32) return { kind: "hex32", nodeId };
  if (isAddress(s)) {
    return { kind: "address", nodeId };
  }
  return { kind: "peer_id", nodeId };
}

export type ParsedNodeRoute = {
  nodeId: NodeId | null;
  kind: NodeIdInputKind;
  /** Libp2p peer id (base58, no `z` multibase prefix) when {@link kind} is `peer_id`. */
  peerIdDisplay: string | null;
};

/**
 * Parse a URL path segment into an on-chain node id (bytes32) plus optional peer-id label.
 * Decodes {@link encodeURIComponent} so `/node/12D3…` and encoded forms both work.
 */
export function parseNodeIdRouteSegment(raw: string): ParsedNodeRoute {
  let decoded = raw.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep trimmed raw */
  }
  const classified = classifyNodeIdInput(decoded);
  if (!classified.nodeId) {
    return { nodeId: null, kind: "invalid", peerIdDisplay: null };
  }
  const multibase = decoded.startsWith("z") ? decoded.slice(1) : decoded;
  const peerIdDisplay =
    classified.kind === "peer_id" ? multibase.trim() : null;
  return {
    nodeId: classified.nodeId,
    kind: classified.kind,
    peerIdDisplay,
  };
}

/** Raw multihash bytes behind a libp2p peer id string (base58), or null. */
export function peerIdMultihashBytes(peerIdDisplay: string): Uint8Array | null {
  const trimmed = peerIdDisplay.trim();
  const multibase = trimmed.startsWith("z") ? trimmed.slice(1) : trimmed;
  if (!looksLikeBase58Libp2pPeerId(multibase)) return null;
  return base58DecodeToBytes(multibase);
}

/** Hex-encoded multihash bytes for UI (“decoded” peer id payload before keccak). */
export function peerIdMultihashHex(peerIdDisplay: string): Hex | null {
  const bytes = peerIdMultihashBytes(peerIdDisplay);
  if (!bytes || bytes.length === 0) return null;
  return bytesToHex(bytes);
}

/**
 * Path segment for `/node/[segment]` after registration: peer id string when applicable,
 * otherwise the bytes32 hex.
 */
export function nodeDetailPathSegmentFromRegistration(params: {
  kind: NodeIdInputKind;
  nodeIdHex: Hex;
  rawIdentityInput: string;
}): string {
  const trimmed = params.rawIdentityInput.trim();
  if (
    params.kind === "peer_id" &&
    trimmed &&
    !isMockSoftwarePeerId(trimmed)
  ) {
    return trimmed.startsWith("z") ? trimmed.slice(1) : trimmed;
  }
  return params.nodeIdHex;
}

export function nodeDetailHrefFromRegistration(params: {
  kind: NodeIdInputKind;
  nodeIdHex: Hex;
  rawIdentityInput: string;
}): string {
  const segment = nodeDetailPathSegmentFromRegistration(params);
  return `/node/${encodeURIComponent(segment)}`;
}

/** Default when the on-chain node key is the padded operator wallet address. */
export function nodeIdFromOperatorWallet(address: Address): NodeId {
  return padHex(getAddress(address), { size: 32 });
}
