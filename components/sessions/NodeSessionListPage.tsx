"use client";

import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useMemo } from "react";
import { useAccount, useChainId } from "wagmi";

import { SessionIndexSection } from "@/components/sessions/SessionIndexSection";
import { SessionListViewToggle } from "@/components/sessions/SessionListViewToggle";
import { RouterTunnelBadge } from "@/components/router/RouterTunnelBadge";
import { ZERO_ADDRESS } from "@/lib/chains";
import { getSession, getSessionIdsForNode } from "@/lib/evm/escrow";
import { listNetworkModels } from "@/lib/evm/modelOracle";
import { routerBaseUrl } from "@/lib/router/activate";
import { sessionDetailHref } from "@/lib/session/display";
import { useSessionListViewMode } from "@/lib/session/useSessionListViewMode";
import { useRouterNodeStatus, useRouterNodesStatus } from "@/lib/router/useRouterData";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { usePortalPublicClient } from "@/lib/usePortalPublicClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { Hex } from "viem";

type NodeSessionListPageProps = {
  nodeIdFromRoute: Hex | null;
  pathSegmentForLinks: string | null;
  backHref: string;
};

export function NodeSessionListPage({
  nodeIdFromRoute,
  pathSegmentForLinks,
  backHref,
}: NodeSessionListPageProps) {
  const { viewMode, patchViewMode } = useSessionListViewMode();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePortalPublicClient();
  const { hubConfig, configError } = useHubChainConfig();

  const chainReady = Boolean(hubConfig && chainId === hubConfig.chainId && isConnected);

  const registryUnset = useMemo(() => {
    if (!hubConfig?.operatorRegistryAddress) return true;
    return hubConfig.operatorRegistryAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  }, [hubConfig]);

  const escrowUnset = useMemo(() => {
    if (!hubConfig?.settlementEscrowAddress) return true;
    return hubConfig.settlementEscrowAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  }, [hubConfig]);

  const { data: sessions = [], error, isFetching } = useQuery({
    queryKey: ["nodeSessions", hubConfig?.chainId, hubConfig?.settlementEscrowAddress, nodeIdFromRoute],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !nodeIdFromRoute) throw new Error("Missing client, config, or node ID");
      const escrow = hubConfig.settlementEscrowAddress;
      const ids = await getSessionIdsForNode(publicClient, escrow, nodeIdFromRoute);
      const rows = await Promise.all(
        ids.map(async (sessionId) => {
          const s = await getSession(publicClient, escrow, sessionId);
          return { sessionId, s };
        }),
      );
      return rows;
    },
    enabled: Boolean(
      chainReady && hubConfig && nodeIdFromRoute && publicClient && !registryUnset && !escrowUnset && !configError,
    ),
  });

  const { data: modelNameById = new Map<string, string>() } = useQuery({
    queryKey: ["modelNames", hubConfig?.modelPriceOracleAddress],
    queryFn: async () => {
      if (!publicClient || !hubConfig?.modelPriceOracleAddress) return new Map<string, string>();
      const models = await listNetworkModels(publicClient, hubConfig.modelPriceOracleAddress);
      return new Map(models.map((m) => [m.modelId.toLowerCase(), m.name]));
    },
    enabled: Boolean(chainReady && hubConfig?.modelPriceOracleAddress && !escrowUnset),
  });

  const errMsg = error instanceof Error ? error.message : "Could not load sessions";
  const routerConfigured = Boolean(routerBaseUrl());
  const { statusByNodeId } = useRouterNodesStatus();
  const { status: routerStatus } = useRouterNodeStatus(nodeIdFromRoute, statusByNodeId);

  const basePath =
    nodeIdFromRoute && pathSegmentForLinks
      ? `/node/${encodeURIComponent(pathSegmentForLinks)}/session`
      : "/node";
  const detailHref = (sessionId: bigint) => sessionDetailHref(basePath, sessionId);

  return (
    <div className="px-3 py-3 w-full space-y-6">
      <NextLink href={backHref} className="text-sm text-muted-foreground hover:underline inline-block">
        ← Node
      </NextLink>

      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold mb-1">Sessions (dev)</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
            Open sessions for this node id from{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">SessionOpened</code> logs
            on SettlementEscrow.
          </p>
          {routerConfigured && nodeIdFromRoute && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-xs text-muted-foreground">Router tunnel:</span>
              <RouterTunnelBadge status={routerStatus?.status ?? "offline"} detail={routerStatus} />
              {routerStatus && (
                <span className="text-xs text-muted-foreground font-mono tabular-nums">
                  {routerStatus.model_count} model(s) cached
                </span>
              )}
            </div>
          )}
        </div>
        {sessions.length > 0 && (
          <SessionListViewToggle viewMode={viewMode} onViewModeChange={patchViewMode} />
        )}
      </div>

      {!nodeIdFromRoute && (
        <Alert variant="destructive">
          <AlertTitle>Invalid node ID</AlertTitle>
          <AlertDescription>Check the URL segment for this page.</AlertDescription>
        </Alert>
      )}

      {configError && (
        <Alert variant="destructive">
          <AlertTitle>Config</AlertTitle>
          <AlertDescription>{configError}</AlertDescription>
        </Alert>
      )}

      {hubConfig && escrowUnset && !configError && (
        <Alert variant="destructive">
          <AlertTitle>Settlement escrow missing</AlertTitle>
          <AlertDescription>Set escrow address in env to index session events.</AlertDescription>
        </Alert>
      )}

      {!isConnected && (
        <Alert variant="informational">
          <AlertTitle>Wallet disconnected</AlertTitle>
          <AlertDescription>Connect to query the hub chain.</AlertDescription>
        </Alert>
      )}

      {isConnected && hubConfig && chainId !== hubConfig.chainId && (
        <Alert variant="warning">
          <AlertTitle>Wrong network</AlertTitle>
          <AlertDescription>
            Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).
          </AlertDescription>
        </Alert>
      )}

      {chainReady && !escrowUnset && error && (
        <Alert variant="destructive">
          <AlertTitle>Load failed</AlertTitle>
          <AlertDescription>{errMsg}</AlertDescription>
        </Alert>
      )}

      {chainReady && !escrowUnset && isFetching ? <Skeleton className="h-[200px] w-full" /> : null}

      {chainReady && !escrowUnset && !isFetching && !error && sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sessions found for this node (from logs). Open a session on escrow first, or lower{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
            NEXT_PUBLIC_SETTLEMENT_ESCROW_FROM_BLOCK
          </code>
          .
        </p>
      ) : null}

      <SessionIndexSection
        rows={sessions}
        modelNameById={modelNameById}
        detailHref={detailHref}
        variant="node"
        viewMode={viewMode}
      />

      {!chainReady && !configError && registryUnset ? <Skeleton className="h-[200px] w-full" /> : null}
    </div>
  );
}
