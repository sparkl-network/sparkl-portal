/**
 * On-chain `metadataURI` may be a bare HTTP(S) origin, JSON with optional
 * `baseUrl` and/or `peer_id` / `node_id` for display — see {@link parseMetadataUri}.
 */

/** Normalize user input to `http(s)://host:port` (no path, query, or hash). */
export function normalizeNodeBaseUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s.includes("://") ? s : `http://${s}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export type ParsedMetadataUri = {
  /** HTTP(S) origin when present (legacy rows or JSON with baseUrl). */
  baseUrl?: string;
  /** Full on-chain string (JSON or legacy URL). */
  raw: string;
  /** Operator-facing label (max 128 chars) from registration JSON. */
  moniker?: string;
  /** Libp2p peer id from registration JSON, when present. */
  peerId?: string;
  /** Canonical `node_id` (`0x` + 64 hex) from registration JSON, when present. */
  nodeId?: string;
};

function peerIdFromJson(o: { peer_id?: unknown }): string | undefined {
  return typeof o.peer_id === "string" && o.peer_id.trim()
    ? o.peer_id.trim()
    : undefined;
}

function nodeIdFromJson(o: { node_id?: unknown }): string | undefined {
  return typeof o.node_id === "string" && o.node_id.trim()
    ? o.node_id.trim()
    : undefined;
}

function monikerFromJson(o: { moniker?: unknown }): string | undefined {
  const m = typeof o.moniker === "string" ? o.moniker.trim() : "";
  if (!m || m.length > 128) return undefined;
  return m;
}

/**
 * Parse `ProviderRegistry` **`metadataURI`**: legacy bare origin URL, or JSON
 * **`{ "version", "baseUrl"?, "peer_id"?, "node_id"? }`**.
 */
export function parseMetadataUri(raw: string): ParsedMetadataUri | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t) as {
        baseUrl?: unknown;
        peer_id?: unknown;
        node_id?: unknown;
        moniker?: unknown;
      };
      const peerId = peerIdFromJson(o);
      const nodeId = nodeIdFromJson(o);
      const moniker = monikerFromJson(o);
      const baseUrl =
        typeof o.baseUrl === "string"
          ? normalizeNodeBaseUrl(o.baseUrl) ?? undefined
          : undefined;
      if (baseUrl || peerId || nodeId || moniker) {
        return { baseUrl, raw: t, peerId, nodeId, moniker };
      }
    } catch {
      return null;
    }
    return null;
  }
  const baseUrl = normalizeNodeBaseUrl(t);
  if (baseUrl) return { baseUrl, raw: t };
  return null;
}

/** HTTP origin when metadata includes one; `null` otherwise. */
export function metadataUriToBaseUrl(uri: string): string | null {
  return parseMetadataUri(uri)?.baseUrl ?? null;
}

/** `peer_id` from versioned registration JSON (`metadataURI`), if stored on-chain. */
export function softwarePeerIdFromMetadataUri(raw: string): string | null {
  return parseMetadataUri(raw)?.peerId ?? null;
}

/** Legacy: moniker in on-chain JSON (prefer router tunnel status from sparkl-solo). */
export function monikerFromMetadataUri(raw: string): string | null {
  return parseMetadataUri(raw)?.moniker ?? null;
}

/**
 * URL to fetch for directory “region” metadata. If `metadataURI` resolves to a bare origin,
 * use `…/details` (legacy node path); otherwise treat as a direct metadata URL.
 */
export function registryMetadataUriToFetchUrl(uri: string): string | null {
  const parsed = parseMetadataUri(uri);
  if (!parsed?.baseUrl) return null;
  try {
    const u = new URL(parsed.baseUrl);
    const path = u.pathname.replace(/\/+$/, "") || "";
    if (path === "") {
      u.pathname = "/details";
      u.search = "";
      u.hash = "";
      return u.toString();
    }
    return parsed.baseUrl;
  } catch {
    return null;
  }
}
