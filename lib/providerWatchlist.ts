import type { Address, Hex } from "viem";
import { isHex, size } from "viem";

import { nodeIdFromOperatorWallet, parseNodeIdInput } from "@/lib/nodeId";

/** Dispatched on same tab when the watchlist mutates; `storage` for other tabs. */
export const PROVIDER_WATCHLIST_EVENT = "sparkl:providerWatchlist";

function storageKey(owner: Address, chainId: number): string {
  return `sparkl:providerWatchlist:v2:${chainId}:${owner.toLowerCase()}`;
}

/**
 * Additional node IDs (`bytes32` hex) this wallet tracks on `chainId` (same browser).
 */
export function readProviderWatchlist(
  owner: Address | undefined,
  chainId: number,
): Hex[] {
  if (typeof window === "undefined" || !owner) return [];
  try {
    const raw = localStorage.getItem(storageKey(owner, chainId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Hex[] = [];
    for (const x of parsed) {
      if (typeof x !== "string") continue;
      const id = parseNodeIdInput(x);
      if (!id) continue;
      out.push(id);
    }
    const uniq = new Map<string, Hex>();
    for (const id of out) uniq.set(id.toLowerCase(), id);
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
  nodeIdInput: string,
): { ok: true } | { ok: false; reason: string } {
  if (typeof window === "undefined") {
    return { ok: false, reason: "Watchlist is only available in the browser." };
  }
  const nodeId = parseNodeIdInput(nodeIdInput);
  if (!nodeId) {
    return {
      ok: false,
      reason: "Enter a valid node ID (0x + 64 hex) or an Ethereum address.",
    };
  }
  const own = nodeIdFromOperatorWallet(owner);
  if (nodeId.toLowerCase() === own.toLowerCase()) {
    return {
      ok: false,
      reason:
        "That node ID matches your connected wallet’s default slot. Track a different node, or switch accounts.",
    };
  }
  const list = readProviderWatchlist(owner, chainId);
  if (list.some((a) => a.toLowerCase() === nodeId.toLowerCase())) {
    return { ok: false, reason: "That node is already in your portfolio." };
  }
  const next = [...list, nodeId].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  localStorage.setItem(storageKey(owner, chainId), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(PROVIDER_WATCHLIST_EVENT));
  return { ok: true };
}

export function removeProviderFromWatchlist(
  owner: Address,
  chainId: number,
  nodeId: Hex,
): void {
  if (typeof window === "undefined") return;
  if (!isHex(nodeId) || size(nodeId) !== 32) return;
  const list = readProviderWatchlist(owner, chainId);
  const next = list.filter((a) => a.toLowerCase() !== nodeId.toLowerCase());
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
