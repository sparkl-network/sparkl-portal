"use client";

import NextLink from "next/link";
import { useState } from "react";

import { SessionIndexSection } from "@/components/sessions/SessionIndexSection";
import { SessionListViewToggle } from "@/components/sessions/SessionListViewToggle";
import { SessionRecoveryHelpModal } from "@/components/sessions/SessionRecoveryHelpModal";
import { sessionDetailHref } from "@/lib/session/display";
import { useSessionListViewMode } from "@/lib/session/useSessionListViewMode";
import { useUserSessionQueries } from "@/lib/session/useUserSessionQueries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type WalletSessionListPageProps = {
  basePath: string;
  backHref: string;
  backLabel?: string;
};

export function WalletSessionListPage({
  basePath,
  backHref,
  backLabel = "User",
}: WalletSessionListPageProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { viewMode, patchViewMode } = useSessionListViewMode();

  const {
    isConnected,
    chainId,
    hubConfig,
    configError,
    chainReady,
    escrowUnset,
    routerConfigured,
    statusByNodeId,
    routerStatusUnavailable,
    sessions,
    error,
    isFetching,
    modelNameById,
  } = useUserSessionQueries();

  const errMsg = error instanceof Error ? error.message : "Could not load sessions";
  const detailHref = (sessionId: bigint) => sessionDetailHref(basePath, sessionId);

  return (
    <div className="px-3 py-3 w-full space-y-6">
      <NextLink href={backHref} className="text-sm text-muted-foreground hover:underline inline-block">
        ← {backLabel}
      </NextLink>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">My sessions</h1>
        <div className="flex items-center gap-2">
          {sessions.length > 0 && (
            <SessionListViewToggle viewMode={viewMode} onViewModeChange={patchViewMode} />
          )}
          <Button variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
            Lost vs compromised
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        Sessions opened by your wallet on SettlementEscrow. Open a session for details, close to remit balances, or migrate after a compromised API key.
      </p>

      {configError && (
        <Alert variant="destructive">
          <AlertTitle>Config</AlertTitle>
          <AlertDescription>{configError}</AlertDescription>
        </Alert>
      )}

      {hubConfig && escrowUnset && !configError && (
        <Alert variant="destructive">
          <AlertTitle>Escrow not configured</AlertTitle>
          <AlertDescription>
            Set{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
              NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_*
            </code>{" "}
            to list and manage sessions.
          </AlertDescription>
        </Alert>
      )}

      {!routerConfigured && (
        <Alert variant="warning">
          <AlertTitle>Router URL missing</AlertTitle>
          <AlertDescription>
            Set{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
              NEXT_PUBLIC_SPARKL_ROUTER_URL
            </code>{" "}
            (browser) and{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">SPARKL_ROUTER_URL</code>{" "}
            (server) to activate sessions and show API keys.
          </AlertDescription>
        </Alert>
      )}

      {!isConnected && (
        <Alert variant="informational">
          <AlertTitle>Connect wallet</AlertTitle>
          <AlertDescription>Connect your wallet to view your sessions.</AlertDescription>
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
          No sessions found for this wallet. Open a session on a node via the escrow contract, or
          lower{" "}
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
        variant="wallet"
        viewMode={viewMode}
        routerConfigured={routerConfigured}
        routerStatusUnavailable={routerStatusUnavailable}
        statusByNodeId={statusByNodeId}
      />

      <SessionRecoveryHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
