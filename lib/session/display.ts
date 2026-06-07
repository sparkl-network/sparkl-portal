import { isEscrowSessionOpen } from "@/lib/evm/escrow";
import { SecurityTier, type EscrowSession } from "@/lib/types";

export function tierLabel(t: SecurityTier): string {
  return t === SecurityTier.BEST_EFFORT ? "Best effort" : "TEE verified";
}

export function shortHex(h: string, head = 10, tail = 6): string {
  if (h.length <= head + tail + 2) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export function sessionTitle(session: EscrowSession, sessionId: bigint): string {
  return session.name.trim() || `Session ${sessionId.toString()}`;
}

export type SessionStatusLabel = "Settled" | "Open" | "Closed (no lock)";

export function sessionStatusLabel(session: EscrowSession): SessionStatusLabel {
  if (session.settled) return "Settled";
  if (isEscrowSessionOpen(session)) return "Open";
  return "Closed (no lock)";
}

export function sessionStatusVariant(
  session: EscrowSession,
): "default" | "secondary" | "outline" {
  if (session.settled) return "secondary";
  if (isEscrowSessionOpen(session)) return "default";
  return "outline";
}

export function formatOpenedAt(openedAt: bigint): string {
  if (openedAt <= 0n) return "—";
  const ms = Number(openedAt) * 1000;
  if (!Number.isFinite(ms)) return openedAt.toString();
  return new Date(ms).toLocaleString();
}

export function sessionDetailHref(basePath: string, sessionId: bigint): string {
  const base = basePath.replace(/\/$/, "");
  return `${base}/${sessionId.toString()}`;
}

export function nodePageHref(nodeId: string): string {
  return `/node/${encodeURIComponent(nodeId)}`;
}

/** Model catalog / oracle page; highlights row when `modelId` query matches. */
export function modelPageHref(modelId: string): string {
  return `/model?modelId=${encodeURIComponent(modelId.toLowerCase())}`;
}
