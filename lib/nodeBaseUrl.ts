/**
 * On-chain `metadataURI` may be a bare HTTP(S) origin or (forward-compatible)
 * a JSON document with a **`baseUrl`** field — see {@link parseMetadataUri}.
 * Probes use **`GET /status`**, **`GET /v1/models`**, **`GET /identity`** (not operator-private paths).
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
  /** HTTP(S) origin for `fetch(base + '/status')`, etc. */
  baseUrl: string;
  /** Full on-chain string (JSON or legacy URL). */
  raw: string;
  /** Software/mock TPM `peer_id` from registration JSON, when present. */
  peerId?: string;
  /** Canonical `node_id` (`0x` + 64 hex) from registration JSON, when present. */
  nodeId?: string;
};

/**
 * Parse `ProviderRegistry` **`metadataURI`**: legacy bare origin URL, or JSON **`{ "version", "baseUrl", ... }`**.
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
      };
      if (typeof o.baseUrl === "string") {
        const baseUrl = normalizeNodeBaseUrl(o.baseUrl);
        if (baseUrl) {
          const peerId =
            typeof o.peer_id === "string" && o.peer_id.trim()
              ? o.peer_id.trim()
              : undefined;
          const nodeId =
            typeof o.node_id === "string" && o.node_id.trim()
              ? o.node_id.trim()
              : undefined;
          return { baseUrl, raw: t, peerId, nodeId };
        }
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

/** HTTP origin for node probes; `null` if invalid. */
export function metadataUriToBaseUrl(uri: string): string | null {
  return parseMetadataUri(uri)?.baseUrl ?? null;
}

/** `peer_id` from versioned registration JSON (`metadataURI`), if stored on-chain. */
export function softwarePeerIdFromMetadataUri(raw: string): string | null {
  return parseMetadataUri(raw)?.peerId ?? null;
}

/**
 * URL to fetch for directory “region” metadata. If `metadataURI` resolves to a bare origin,
 * use `…/details` (legacy node path); otherwise treat as a direct metadata URL.
 */
export function registryMetadataUriToFetchUrl(uri: string): string | null {
  const parsed = parseMetadataUri(uri);
  if (!parsed) return null;
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
