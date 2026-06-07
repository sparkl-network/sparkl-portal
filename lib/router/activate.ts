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

export { routerBaseUrl, routerConfigured } from "@/lib/router/routerClient";
