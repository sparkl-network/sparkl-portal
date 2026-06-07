import {
  fetchRouterFeatureCatalog,
  fetchRouterProviders,
  type FetchProvidersOptions,
} from "@/lib/router/catalog";
import { fetchRouterNodeStatus, fetchRouterNodesStatus } from "@/lib/router/status";
import {
  startRouterTelemetryService,
  stopRouterTelemetryService,
  subscribeRouterTelemetryHub,
  type RouterTelemetryListener,
} from "@/lib/router/telemetryHub";

export type { RouterTelemetryListener };

/** Browser-visible router base URL (no trailing slash). */
export function routerBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SPARKL_ROUTER_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function routerConfigured(): boolean {
  return Boolean(routerBaseUrl());
}

/** HTTP access to sparkl-router via portal API proxies. */
export const routerHttp = {
  fetchProviders: (options?: FetchProvidersOptions) =>
    fetchRouterProviders(options),
  fetchFeatureCatalog: () => fetchRouterFeatureCatalog(),
  fetchNodesStatus: () => fetchRouterNodesStatus(),
  fetchNodeStatus: (nodeId: string) => fetchRouterNodeStatus(nodeId),
};

/** WebSocket access to sparkl-router (telemetry today; extensible for future streams). */
export const routerWs = {
  startTelemetry: startRouterTelemetryService,
  stopTelemetry: stopRouterTelemetryService,
  subscribeTelemetry: subscribeRouterTelemetryHub,
};
