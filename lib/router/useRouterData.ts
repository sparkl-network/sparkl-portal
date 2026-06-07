"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";

import { useRouter } from "@/lib/router/RouterProvider";
import { buildStatusMap } from "@/lib/router/merge";
import { normalizeNodeId } from "@/lib/router/normalizeNodeId";
import type { NodeStatus } from "@/lib/router/types";

const STALE_MS = 15_000;

export function useRouterNodesStatus() {
  const { configured, http } = useRouter();
  const query = useQuery({
    queryKey: ["routerStatus", "nodes"],
    queryFn: () => http.fetchNodesStatus(),
    enabled: configured,
    staleTime: STALE_MS,
    refetchInterval: STALE_MS,
    retry: 1,
  });

  const statusByNodeId = useMemo(
    () => (query.data ? buildStatusMap(query.data.nodes) : new Map<string, NodeStatus>()),
    [query.data],
  );
  const unavailable =
    configured &&
    !query.isLoading &&
    !query.isFetching &&
    query.isError &&
    (query.error instanceof Error &&
      (query.error.message.includes("503") ||
        query.error.message.includes("not configured")));

  return { ...query, statusByNodeId, configured, unavailable };
}

export function useRouterCatalogProviders() {
  const { configured, http } = useRouter();
  return useQuery({
    queryKey: ["routerCatalog", "providers", { onlineOnly: false }],
    queryFn: () => http.fetchProviders({ onlineOnly: false }),
    enabled: configured,
    staleTime: STALE_MS,
    refetchInterval: STALE_MS,
    retry: 1,
  });
}

export function useRouterFeatureCatalog() {
  const { configured, http } = useRouter();
  return useQuery({
    queryKey: ["routerCatalog", "features"],
    queryFn: () => http.fetchFeatureCatalog(),
    enabled: configured,
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Single-node status: prefer list cache; fetch by id when missing (offline / not in tunnel list).
 */
export function useRouterNodeStatus(
  nodeId: Hex | null | undefined,
  listMap?: Map<string, NodeStatus>,
) {
  const key = normalizeNodeId(nodeId);
  const fromList = key && listMap ? listMap.get(key) : undefined;
  const { configured, http } = useRouter();
  const enabled = configured && Boolean(key) && !fromList;

  const query = useQuery({
    queryKey: ["routerStatus", "node", key],
    queryFn: () => http.fetchNodeStatus(key!),
    enabled,
    staleTime: STALE_MS,
    retry: 1,
  });

  const status = fromList ?? query.data;
  return {
    status,
    isLoading: !fromList && query.isLoading,
    isError: !fromList && query.isError,
    error: query.error,
  };
}

export function lookupRouterStatus(
  statusByNodeId: Map<string, NodeStatus>,
  nodeId: string | Hex | null | undefined,
): NodeStatus | undefined {
  const key = normalizeNodeId(nodeId);
  if (!key) return undefined;
  return statusByNodeId.get(key);
}
