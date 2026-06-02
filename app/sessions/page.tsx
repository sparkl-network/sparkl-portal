"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";

import { ApiKeyRevealModal } from "@/components/sessions/ApiKeyRevealModal";
import { CloseSessionModal } from "@/components/sessions/CloseSessionModal";
import { MigrateSessionModal } from "@/components/sessions/MigrateSessionModal";
import { SessionRecoveryHelpModal } from "@/components/sessions/SessionRecoveryHelpModal";
import { settlementEscrowAbi } from "@/lib/abi";
import { ZERO_ADDRESS } from "@/lib/chains";
import { getSession, getSessionIdsForUser } from "@/lib/evm/escrow";
import { listNetworkModels } from "@/lib/evm/modelOracle";
import { activateSessionViaPortal } from "@/lib/router/activateClient";
import { routerBaseUrl } from "@/lib/router/activate";
import { SecurityTier } from "@/lib/types";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWalletClient,
} from "wagmi";

function tierLabel(t: SecurityTier): string {
  return t === SecurityTier.BEST_EFFORT ? "Best effort" : "TEE verified";
}

function shortHex(h: string, head = 10, tail = 6): string {
  if (h.length <= head + tail + 2) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export default function MySessionsPage() {
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { hubConfig, configError } = useHubChainConfig();

  const [helpOpen, setHelpOpen] = useState(false);
  const [activateBusyId, setActivateBusyId] = useState<string | null>(null);
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
    isConnected && hubConfig && chainId === hubConfig.chainId && address && publicClient && walletClient,
  );

  const escrowUnset = useMemo(() => {
    if (!hubConfig?.settlementEscrowAddress) return true;
    return hubConfig.settlementEscrowAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  }, [hubConfig]);

  const routerConfigured = Boolean(routerBaseUrl());

  const { data: dotBalance = 0n } = useReadContract({
    address: hubConfig?.settlementEscrowAddress,
    abi: settlementEscrowAbi,
    functionName: "getDotBalances",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(chainReady && hubConfig && address && !escrowUnset) },
  });

  const { data: sessions = [], error, isFetching } = useQuery({
    queryKey: ["userSessions", hubConfig?.chainId, hubConfig?.settlementEscrowAddress, address],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !address) throw new Error("Missing client, config, or wallet");
      const escrow = hubConfig.settlementEscrowAddress;
      const ids = await getSessionIdsForUser(publicClient, escrow, address);
      const rows = await Promise.all(ids.map(async (sessionId) => {
        const s = await getSession(publicClient, escrow, sessionId);
        return { sessionId, s };
      }));
      return rows.sort((a, b) => a.sessionId < b.sessionId ? 1 : a.sessionId > b.sessionId ? -1 : 0);
    },
    enabled: Boolean(chainReady && hubConfig && !escrowUnset && !configError),
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

  function invalidateSessions() {
    void queryClient.invalidateQueries({ queryKey: ["userSessions"] });
  }

  async function showApiKeyAgain(sessionId: bigint) {
    if (!walletClient || !publicClient) return;
    setActivateError(null);
    setActivateBusyId(sessionId.toString());
    try {
      const res = await activateSessionViaPortal({ walletClient, publicClient, sessionId });
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
      setActivateBusyId(null);
    }
  }

  const errMsg = error instanceof Error ? error.message : "Could not load sessions";

  return (
    <div className="px-3 py-3 w-full space-y-6">
      {/* Back link */}
      <NextLink href="/user" className="text-sm text-muted-foreground hover:underline inline-block">
        ← User
      </NextLink>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">My sessions</h1>
        <Button variant="secondary" size="sm" onClick={() => setHelpOpen(true)}>
          Lost vs compromised
        </Button>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        Sessions opened by your wallet on SettlementEscrow. Close to remit balances; migrate after a compromised API key; show API key again only when the session is still open.
      </p>

      {/* Error banners */}
      {configError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Config</AlertTitle>
          <AlertDescription>{configError}</AlertDescription>
        </Alert>
      )}

      {hubConfig && escrowUnset && !configError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Escrow not configured</AlertTitle>
          <AlertDescription>
            Set <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_*</code> to list and manage sessions.
          </AlertDescription>
        </Alert>
      )}

      {!routerConfigured && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>Router URL missing</AlertTitle>
          <AlertDescription>
            Set <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">NEXT_PUBLIC_SPARKL_ROUTER_URL</code> (browser) and{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">SPARKL_ROUTER_URL</code> (server) to activate sessions and show API keys.
          </AlertDescription>
        </Alert>
      )}

      {!isConnected && (
        <Alert variant="informational" className="mb-4">
          <AlertTitle>Connect wallet</AlertTitle>
          <AlertDescription>Connect your wallet to view your sessions.</AlertDescription>
        </Alert>
      )}

      {isConnected && hubConfig && chainId !== hubConfig.chainId && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>Wrong network</AlertTitle>
          <AlertDescription>Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).</AlertDescription>
        </Alert>
      )}

      {activateError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Activate failed</AlertTitle>
          <AlertDescription>{activateError}</AlertDescription>
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
          No sessions found for this wallet. Open a session on a node via the escrow contract, or lower{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">NEXT_PUBLIC_SETTLEMENT_ESCROW_FROM_BLOCK</code>.
        </p>
      ) : null}

      {/* Session cards */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map(({ sessionId, s }) => {
            const modelLabel = modelNameById.get(s.modelId.toLowerCase()) ?? shortHex(s.modelId);
            const nodeHref = `/node/${encodeURIComponent(s.nodeId)}`;
            const open = !s.settled && s.lockedInternal > 0n;
            const canClose = !s.settled && s.lockedInternal > 0n;

            return (
              <Card key={sessionId.toString()}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-mono text-sm truncate">Session {sessionId.toString()}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <Badge variant={s.settled ? "secondary" : open ? "default" : "outline"}>
                      {s.settled ? "Settled" : open ? "Open" : "Closed (no lock)"}
                    </Badge>
                    <span>{tierLabel(s.tier)}</span>
                    <span className="font-mono">{modelLabel}</span>
                  </div>

                  <p className="text-xs text-muted-foreground font-mono">
                    Node{" "}
                    <NextLink href={nodeHref} className="underline underline-offset-2 hover:text-foreground/80">
                      {shortHex(s.nodeId)}
                    </NextLink>
                  </p>

                  <p className="text-xs text-muted-foreground font-mono tabular-nums">
                    Locked {formatUnits(s.lockedInternal, 18)} · Usage{" "}
                    {formatUnits(s.usageRecorded, 18)} · Paid provider{" "}
                    {formatUnits(s.paidToProviderInternal, 18)}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {!s.settled && (
                      <Button variant="secondary" size="sm" disabled={!routerConfigured || !walletClient} onClick={() => void showApiKeyAgain(sessionId)}>
                        {activateBusyId === sessionId.toString() ? "Showing..." : "Show API key again"}
                      </Button>
                    )}
                    {canClose && (
                      <Button variant="secondary" size="sm" onClick={() => setCloseTarget({ sessionId, session: s })}>
                        Close session
                      </Button>
                    )}
                    {!s.settled && (
                      <Button variant="secondary" size="sm" onClick={() => setMigrateTarget({ sessionId, session: s })}>
                        Migrate (compromised)
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modals */}
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
