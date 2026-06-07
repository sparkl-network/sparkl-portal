"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useMemo, useState } from "react";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import type { Hex } from "viem";

import { ApiKeyRevealModal } from "@/components/sessions/ApiKeyRevealModal";
import { CloseSessionModal } from "@/components/sessions/CloseSessionModal";
import { MigrateSessionModal } from "@/components/sessions/MigrateSessionModal";
import { SessionBalancesCard } from "@/components/sessions/SessionBalancesCard";
import { SessionRecoveryHelpModal } from "@/components/sessions/SessionRecoveryHelpModal";
import { RouterTunnelBadge } from "@/components/router/RouterTunnelBadge";
import { settlementEscrowAbi } from "@/lib/abi";
import { ZERO_ADDRESS } from "@/lib/chains";
import { getSession, isEscrowSessionOpen } from "@/lib/evm/escrow";
import { listNetworkModels } from "@/lib/evm/modelOracle";
import { activateSessionViaPortal } from "@/lib/router/activateClient";
import { routerBaseUrl } from "@/lib/router/activate";
import { isTunnelHealthy } from "@/lib/router/merge";
import { lookupRouterStatus, useRouterNodesStatus } from "@/lib/router/useRouterData";
import {
  formatOpenedAt,
  sessionStatusLabel,
  sessionStatusVariant,
  modelPageHref,
  nodePageHref,
  sessionTitle,
  shortHex,
  tierLabel,
} from "@/lib/session/display";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { usePortalPublicClient } from "@/lib/usePortalPublicClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SessionDetailViewProps = {
  sessionId: bigint | null;
  backHref: string;
  backLabel?: string;
  expectedNodeId?: Hex | null;
};

export function SessionDetailView({
  sessionId,
  backHref,
  backLabel = "My sessions",
  expectedNodeId,
}: SessionDetailViewProps) {
  const queryClient = useQueryClient();
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const publicClient = usePortalPublicClient();
  const { data: walletClient } = useWalletClient();
  const { hubConfig, configError } = useHubChainConfig();

  const [helpOpen, setHelpOpen] = useState(false);
  const [activateBusy, setActivateBusy] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [apiKeyModal, setApiKeyModal] = useState<{
    apiKey: string;
    sessionId: string;
    title: string;
    description: string;
  } | null>(null);
  const [closeTarget, setCloseTarget] = useState<{
    sessionId: bigint;
    session: Awaited<ReturnType<typeof getSession>>;
  } | null>(null);
  const [migrateTarget, setMigrateTarget] = useState<{
    sessionId: bigint;
    session: Awaited<ReturnType<typeof getSession>>;
  } | null>(null);

  const chainReady = Boolean(
    isConnected && hubConfig && chainId === hubConfig.chainId && address && publicClient,
  );

  const escrowUnset = useMemo(() => {
    if (!hubConfig?.settlementEscrowAddress) return true;
    return hubConfig.settlementEscrowAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  }, [hubConfig]);

  const routerConfigured = Boolean(routerBaseUrl());
  const { statusByNodeId, unavailable: routerStatusUnavailable } = useRouterNodesStatus();

  const { data: dotBalance = 0n } = useQuery({
    queryKey: [
      "sessionsEscrowBalance",
      hubConfig?.chainId,
      hubConfig?.settlementEscrowAddress,
      address,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig?.settlementEscrowAddress || !address) return 0n;
      const raw = await publicClient.readContract({
        address: hubConfig.settlementEscrowAddress,
        abi: settlementEscrowAbi,
        functionName: "getDotBalances",
        args: [address],
      });
      return raw as bigint;
    },
    enabled: Boolean(chainReady && publicClient && hubConfig && address && !escrowUnset),
  });

  const {
    data: session,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["sessionDetail", hubConfig?.chainId, hubConfig?.settlementEscrowAddress, sessionId?.toString()],
    queryFn: async () => {
      if (!publicClient || !hubConfig || sessionId === null) throw new Error("Missing client, config, or session");
      return getSession(publicClient, hubConfig.settlementEscrowAddress, sessionId);
    },
    enabled: Boolean(chainReady && hubConfig && !escrowUnset && !configError && sessionId !== null),
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

  const isOwner =
    Boolean(session && address && session.user.toLowerCase() === address.toLowerCase());
  const open = session ? isEscrowSessionOpen(session) : false;
  const canClose = session ? !session.settled && session.lockedInternal > 0n : false;
  const nodeRouterStatus = session ? lookupRouterStatus(statusByNodeId, session.nodeId) : undefined;
  const tunnelUnhealthy =
    routerConfigured &&
    !routerStatusUnavailable &&
    open &&
    nodeRouterStatus &&
    !isTunnelHealthy(nodeRouterStatus.status);

  const nodeMismatch =
    expectedNodeId &&
    session &&
    session.nodeId.toLowerCase() !== expectedNodeId.toLowerCase();

  function invalidateSessions() {
    void queryClient.invalidateQueries({ queryKey: ["userSessions"] });
    void queryClient.invalidateQueries({ queryKey: ["sessionDetail"] });
    void queryClient.invalidateQueries({ queryKey: ["nodeSessions"] });
  }

  async function showApiKeyAgain() {
    if (!walletClient || !publicClient || sessionId === null) return;
    setActivateError(null);
    setActivateBusy(true);
    try {
      const res = await activateSessionViaPortal({
        walletClient,
        publicClient,
        sessionId,
        connector,
      });
      setApiKeyModal({
        apiKey: res.apiKey,
        sessionId: sessionId.toString(),
        title: "API key (same session)",
        description:
          "This re-activates your open session. Anyone with your wallet can do this. If you suspect key theft, close or migrate instead — this does not rotate secrets on a deterministic node.",
      });
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : String(e));
    } finally {
      setActivateBusy(false);
    }
  }

  const errMsg = error instanceof Error ? error.message : "Could not load session";
  const modelLabel = session
    ? modelNameById.get(session.modelId.toLowerCase()) ?? shortHex(session.modelId)
    : "";
  const nodeHref = session ? nodePageHref(session.nodeId) : "#";
  const modelHref = session ? modelPageHref(session.modelId) : "#";

  return (
    <div className="px-3 py-3 w-full space-y-6">
      <NextLink href={backHref} className="text-sm text-muted-foreground hover:underline inline-block">
        ← {backLabel}
      </NextLink>

      {sessionId === null && (
        <Alert variant="destructive">
          <AlertTitle>Invalid session ID</AlertTitle>
          <AlertDescription>The URL must include a valid numeric session id.</AlertDescription>
        </Alert>
      )}

      {sessionId !== null && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold">
            {session ? sessionTitle(session, sessionId) : `Session ${sessionId.toString()}`}
          </h1>
          {isOwner && (
            <Button variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
              Lost vs compromised
            </Button>
          )}
        </div>
      )}

      {nodeMismatch && (
        <Alert variant="warning">
          <AlertTitle>Node mismatch</AlertTitle>
          <AlertDescription>
            This session&apos;s node id does not match the node in this URL. Showing on-chain data
            anyway.
          </AlertDescription>
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
          <AlertTitle>Escrow not configured</AlertTitle>
          <AlertDescription>Set settlement escrow address in env to load sessions.</AlertDescription>
        </Alert>
      )}

      {!routerConfigured && isOwner && (
        <Alert variant="warning">
          <AlertTitle>Router URL missing</AlertTitle>
          <AlertDescription>
            Set router URL env vars to activate sessions and show API keys.
          </AlertDescription>
        </Alert>
      )}

      {!isConnected && (
        <Alert variant="informational">
          <AlertTitle>Connect wallet</AlertTitle>
          <AlertDescription>Connect your wallet to manage your sessions.</AlertDescription>
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

      {activateError && (
        <Alert variant="destructive">
          <AlertTitle>Activate failed</AlertTitle>
          <AlertDescription>{activateError}</AlertDescription>
        </Alert>
      )}

      {chainReady && !escrowUnset && sessionId !== null && error && (
        <Alert variant="destructive">
          <AlertTitle>Load failed</AlertTitle>
          <AlertDescription>{errMsg}</AlertDescription>
        </Alert>
      )}

      {chainReady && !escrowUnset && sessionId !== null && isFetching ? (
        <Skeleton className="h-[280px] w-full" />
      ) : null}

      {session && sessionId !== null && !isFetching && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant={sessionStatusVariant(session)}>{sessionStatusLabel(session)}</Badge>
            <span className="text-sm text-muted-foreground">{tierLabel(session.tier)}</span>
            {session && (
              <NextLink
                href={modelHref}
                className="text-sm font-mono text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {modelLabel}
              </NextLink>
            )}
          </div>

          <p className="text-xs text-muted-foreground font-mono tabular-nums">id {sessionId.toString()}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Node</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <NextLink href={nodeHref} className="font-mono text-sm underline underline-offset-2">
                  {shortHex(session.nodeId)}
                </NextLink>
                {routerConfigured && !routerStatusUnavailable && (
                  <RouterTunnelBadge
                    status={nodeRouterStatus?.status ?? "offline"}
                    detail={nodeRouterStatus}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Model</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                <NextLink href={modelHref} className="text-sm underline underline-offset-2 block">
                  {modelLabel}
                </NextLink>
                <code className="text-xs font-mono text-muted-foreground break-all">{session.modelId}</code>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">User</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <code className="text-xs break-all">{session.user}</code>
              </CardContent>
            </Card>

            {publicClient && hubConfig?.modelPriceOracleAddress ? (
              <SessionBalancesCard
                session={session}
                publicClient={publicClient}
                escrowAddress={hubConfig.settlementEscrowAddress}
                modelOracleAddress={hubConfig.modelPriceOracleAddress}
                dotSymbol={hubConfig.nativeCurrency.symbol}
              />
            ) : null}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Tokens & time</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1 text-sm font-mono tabular-nums">
                <p>Input tokens {session.inputTokensRecorded.toString()}</p>
                <p>Output tokens {session.outputTokensRecorded.toString()}</p>
                <p>Opened {formatOpenedAt(session.openedAt)}</p>
              </CardContent>
            </Card>
          </div>

          {tunnelUnhealthy && (
            <Alert variant="warning">
              <AlertDescription className="text-sm">
                Node tunnel is not healthy ({nodeRouterStatus?.status}) — chat may fail. Check the
                node runtime and router connection.
              </AlertDescription>
            </Alert>
          )}

          {!isOwner && (
            <p className="text-sm text-muted-foreground">
              Connect the wallet that opened this session to close, migrate, or show an API key.
            </p>
          )}

          {isOwner && (
            <div className="flex flex-wrap gap-2">
              {!session.settled && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!routerConfigured || !walletClient || !open}
                  onClick={() => void showApiKeyAgain()}
                >
                  {activateBusy ? "Showing..." : "Show API key again"}
                </Button>
              )}
              {canClose && session && sessionId !== null && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCloseTarget({ sessionId, session })}
                >
                  Close session
                </Button>
              )}
              {!session.settled && session && sessionId !== null && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setMigrateTarget({ sessionId, session })}
                >
                  Migrate (compromised)
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <SessionRecoveryHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {apiKeyModal && (
        <ApiKeyRevealModal
          open={true}
          onClose={() => setApiKeyModal(null)}
          apiKey={apiKeyModal.apiKey}
          sessionId={apiKeyModal.sessionId}
          title={apiKeyModal.title}
          description={apiKeyModal.description}
        />
      )}

      {closeTarget && walletClient && publicClient && hubConfig && (
        <CloseSessionModal
          open
          onClose={() => setCloseTarget(null)}
          sessionId={closeTarget.sessionId}
          session={closeTarget.session}
          escrowAddress={hubConfig.settlementEscrowAddress}
          walletClient={walletClient}
          publicClient={publicClient}
          onSettled={invalidateSessions}
        />
      )}

      {migrateTarget && walletClient && publicClient && hubConfig && !escrowUnset && (
        <MigrateSessionModal
          open
          onClose={() => setMigrateTarget(null)}
          sessionId={migrateTarget.sessionId}
          session={migrateTarget.session}
          escrowAddress={hubConfig.settlementEscrowAddress}
          oracleAddress={hubConfig.modelPriceOracleAddress}
          walletClient={walletClient}
          publicClient={publicClient}
          dotBalance={typeof dotBalance === "bigint" ? dotBalance : 0n}
          onComplete={invalidateSessions}
        />
      )}
    </div>
  );
}
