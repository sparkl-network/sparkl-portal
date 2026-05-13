/**
 * Node “base URL” stored on-chain in `metadataURI`: origin only (`http(s)://host:port`),
 * matching {@link normalizeNodeBaseUrl} and the provider-node probe (GET `/status`, `/details`, `/v1/models`).
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

/**
 * URL to fetch for directory “region” metadata. If `metadataURI` is a bare origin (or `/` only),
 * use `…/details`; otherwise treat it as a legacy direct JSON URL.
 */
export function registryMetadataUriToFetchUrl(uri: string): string | null {
  const t = uri.trim();
  if (!t.startsWith("http://") && !t.startsWith("https://")) return null;
  try {
    const u = new URL(t);
    const path = u.pathname.replace(/\/+$/, "") || "";
    if (path === "") {
      u.pathname = "/details";
      u.search = "";
      u.hash = "";
      return u.toString();
    }
    return t;
  } catch {
    return null;
  }
}
