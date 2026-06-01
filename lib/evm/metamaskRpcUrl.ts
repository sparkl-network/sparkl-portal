/** Hostnames MetaMask allows with `http:` in `wallet_addEthereumChain` rpcUrls. */
function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** RFC1918-style hosts that MetaMask rejects for programmatic `http:` RPC adds. */
function isPrivateLanHost(hostname: string): boolean {
  if (hostname.endsWith(".localhost")) return true;
  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export type WalletAddRpcUrlResult = {
  /** URL passed to `wallet_addEthereumChain` `rpcUrls`. */
  addUrl: string;
  /** Canonical chain RPC from env (`chainRpcUrl`). */
  pageUrl: string;
  /** True when `addUrl` was rewritten to loopback for MetaMask HTTP policy. */
  usedLoopbackForAdd: boolean;
};

/** True when the portal tab uses `http://192.168.x.x/...` — MetaMask blocks programmatic add. */
export function isHttpLanPageRpc(pageRpcUrl: string): boolean {
  try {
    const u = new URL(pageRpcUrl);
    return u.protocol === "http:" && isPrivateLanHost(u.hostname);
  } catch {
    return false;
  }
}

/**
 * MetaMask only accepts `http:` rpcUrls for loopback hosts. Do not rewrite LAN to
 * 127.0.0.1 — that registers a second network and MetaMask may send via the wrong RPC.
 */
export function walletAddEthereumChainRpcUrl(pageRpcUrl: string): WalletAddRpcUrlResult {
  const pageUrl = pageRpcUrl;
  try {
    const u = new URL(pageRpcUrl);
    if (u.protocol === "https:" || isLoopbackHost(u.hostname)) {
      return { addUrl: pageRpcUrl, pageUrl, usedLoopbackForAdd: false };
    }
    if (u.protocol === "http:" && isPrivateLanHost(u.hostname)) {
      return { addUrl: pageRpcUrl, pageUrl, usedLoopbackForAdd: false };
    }
  } catch {
    /* fall through */
  }
  return { addUrl: pageRpcUrl, pageUrl, usedLoopbackForAdd: false };
}

export function manualLanRpcHint(pageRpcUrl: string): string | null {
  try {
    const u = new URL(pageRpcUrl);
    if (u.protocol !== "http:" || !isPrivateLanHost(u.hostname)) return null;
    return `MetaMask will not auto-add HTTP LAN chain RPC (${pageRpcUrl}). Add it manually under Settings → Networks, or use http://127.0.0.1:8545 on this machine.`;
  } catch {
    return null;
  }
}
