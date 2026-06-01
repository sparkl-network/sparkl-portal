/** Canonical activate message signed by the session owner (matches sparkl-router). */
export function buildActivateMessage(
  sessionId: bigint,
  blockNumber: bigint,
): string {
  return `sparkl-activate:${sessionId}:${blockNumber}`;
}

export type RouterActivateResponse = {
  apiKey: string;
  sessionId: string;
};

export function routerBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SPARKL_ROUTER_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}
