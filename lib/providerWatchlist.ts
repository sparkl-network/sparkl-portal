import type { Address } from "viem";
import { getAddress, isAddress } from "viem";

/** Dispatched on same tab when the watchlist mutates; `storage` for other tabs. */
export const PROVIDER_WATCHLIST_EVENT = "sparkl:providerWatchlist";

function storageKey(owner: Address, chainId: number): string {
  return `sparkl:providerWatchlist:v1:${chainId}:${owner.toLowerCase()}`;
}

/**
 * Additional operator addresses this wallet tracks on `chainId` (same browser).
 * On-chain, each operator EOA still has one slot; use different keys for more nodes.
 */
export function readProviderWatchlist(
  owner: Address | undefined,
  chainId: number,
): Address[] {
  if (typeof window === "undefined" || !owner) return [];
  try {
    const raw = localStorage.getItem(storageKey(owner, chainId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Address[] = [];
    for (const x of parsed) {
      if (typeof x !== "string" || !isAddress(x)) continue;
      try {
        out.push(getAddress(x));
      } catch {
        /* skip */
      }
    }
    const uniq = new Map<string, Address>();
    for (const a of out) uniq.set(a.toLowerCase(), a);
    return [...uniq.values()].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
  } catch {
    return [];
  }
}

export function addProviderToWatchlist(
  owner: Address,
  chainId: number,
  operator: Address,
): { ok: true } | { ok: false; reason: string } {
  if (typeof window === "undefined") {
    return { ok: false, reason: "Watchlist is only available in the browser." };
  }
  const own = owner.toLowerCase();
  if (operator.toLowerCase() === own) {
    return {
      ok: false,
      reason:
        "That address is your connected wallet. Switch accounts in the wallet toolbar to register another operator key.",
    };
  }
  const list = readProviderWatchlist(owner, chainId);
  if (list.some((a) => a.toLowerCase() === operator.toLowerCase())) {
    return { ok: false, reason: "That operator is already in your portfolio." };
  }
  const next = [...list, operator].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  localStorage.setItem(storageKey(owner, chainId), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(PROVIDER_WATCHLIST_EVENT));
  return { ok: true };
}

export function removeProviderFromWatchlist(
  owner: Address,
  chainId: number,
  operator: Address,
): void {
  if (typeof window === "undefined") return;
  const list = readProviderWatchlist(owner, chainId);
  const next = list.filter(
    (a) => a.toLowerCase() !== operator.toLowerCase(),
  );
  localStorage.setItem(storageKey(owner, chainId), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(PROVIDER_WATCHLIST_EVENT));
}

export function subscribeProviderWatchlist(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(PROVIDER_WATCHLIST_EVENT, handler);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("sparkl:providerWatchlist:")) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PROVIDER_WATCHLIST_EVENT, handler);
    window.removeEventListener("storage", onStorage);
  };
}
