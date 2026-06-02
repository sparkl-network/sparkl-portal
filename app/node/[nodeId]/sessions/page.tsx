"use client";

import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { formatUnits } from "viem";

import { ZERO_ADDRESS } from "@/lib/chains";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession, getSessionIdsForNode } from "@/lib/evm/escrow";
import { SecurityTier } from "@/lib/types";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { useResolvedNodeRoute } from "@/lib/useResolvedNodeRoute";
import { useAccount, useChainId, usePublicClient } from "wagmi";

function tierLabel(t: SecurityTier): string {
  return t === SecurityTier.BEST_EFFORT ? "Best Effort" : "TEE verified";
}

export default function NodeSessionsPage() {
  const params = useParams();
  const raw = typeof params.nodeId === "string" ? params.nodeId : Array.isArray(params.nodeId) ? params.nodeId[0] : "";
  const { nodeId: nodeIdFromRoute, pathSegmentForLinks } = useResolvedNodeRoute(raw);

  const backHref = nodeIdFromRoute && pathSegmentForLinks ? `/node/${encodeURIComponent(pathSegmentForLinks)}` : "/node";

  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
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
      const rows = await Promise.all(ids.map(async (sessionId) => {
        const s = await getSession(publicClient, escrow, sessionId);
        return { sessionId, s };
      }));
      return rows;
    },
    enabled: Boolean(chainReady && hubConfig && nodeIdFromRoute && publicClient && !registryUnset && !escrowUnset && !configError),
  });

  const errMsg = error instanceof Error ? error.message : "Could not load sessions";

  return (
    <div className="px-3 py-3 w-full space-y-6">
      {/* Back link */}
      <NextLink href={backHref} className="text-sm text-muted-foreground hover:underline inline-block">
        ← Node
      </NextLink>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">Sessions (dev)</h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
          Open sessions for this node id from{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">SessionOpened</code>{" "}
          logs on SettlementEscrow.
        </p>
      </div>

      {/* Error banners */}
      {!nodeIdFromRoute && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Invalid node ID</AlertTitle>
          <AlertDescription>Check the URL segment for this page.</AlertDescription>
        </Alert>
      )}

      {configError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Config</AlertTitle>
          <AlertDescription>{configError}</AlertDescription>
        </Alert>
      )}

      {hubConfig && escrowUnset && !configError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Settlement escrow missing</AlertTitle>
          <AlertDescription>Set escrow address in env to index session events.</AlertDescription>
        </Alert>
      )}

      {!isConnected && (
        <Alert variant="informational" className="mb-4">
          <AlertTitle>Wallet disconnected</AlertTitle>
          <AlertDescription>Connect to query the hub chain.</AlertDescription>
        </Alert>
      )}

      {isConnected && hubConfig && chainId !== hubConfig.chainId && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>Wrong network</AlertTitle>
          <AlertDescription>Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).</AlertDescription>
        </Alert>
      )}

      {chainReady && !escrowUnset && error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Load failed</AlertTitle>
          <AlertDescription>{errMsg}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {chainReady && !escrowUnset && isFetching ? (
        <Skeleton className="h-[200px] w-full" />
      ) : null}

      {/* Empty state */}
      {chainReady && !escrowUnset && !isFetching && !error && sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sessions found for this node (from logs). Open a session on escrow first, or lower{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">NEXT_PUBLIC_SETTLEMENT_ESCROW_FROM_BLOCK</code>.
        </p>
      ) : null}

      {/* Session cards */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map(({ sessionId, s }) => (
            <Card key={sessionId.toString()}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-mono text-sm tabular-nums truncate">Session {sessionId.toString()}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                <p className="text-xs text-muted-foreground font-mono">
                  user {s.user} · tier{" "}
                  <Badge variant="secondary" className="text-[10px]">{tierLabel(s.tier)}</Badge> · settled {" "}
                  <span className={s.settled ? "text-red-500" : "text-green-600"}>{s.settled ? "yes" : "no"}</span>
                </p>
                <p className="text-xs text-muted-foreground font-mono tabular-nums">
                  locked {formatUnits(s.lockedInternal, 18)} · usage {formatUnits(s.usageRecorded, 18)} · paid provider {formatUnits(s.paidToProviderInternal, 18)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!chainReady && !configError && registryUnset ? (
        <Skeleton className="h-[200px] w-full" />
      ) : null}
    </div>
  );
}
