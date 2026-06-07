"use client";

import { useMemo } from "react";

import { useRouter } from "@/lib/router/RouterProvider";
import type { NodeStatus, ProviderOffering } from "@/lib/router/types";

export function useRouterTelemetry(options: {
  enabled?: boolean;
  initialProviders?: ProviderOffering[] | undefined;
  initialNodes?: NodeStatus[] | undefined;
} = {}) {
  const { enabled = true, initialProviders, initialNodes } = options;
  const { telemetry } = useRouter();

  return useMemo(() => {
    if (!enabled) {
      return {
        connected: false,
        error: null,
        providers: initialProviders ?? null,
        nodes: initialNodes ?? null,
      };
    }

    return {
      connected: telemetry.connected,
      error: telemetry.error,
      providers: telemetry.providers ?? initialProviders ?? null,
      nodes: telemetry.nodes ?? initialNodes ?? null,
    };
  }, [
    enabled,
    telemetry.connected,
    telemetry.error,
    telemetry.providers,
    telemetry.nodes,
    initialProviders,
    initialNodes,
  ]);
}
