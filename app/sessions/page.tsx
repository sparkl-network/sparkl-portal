"use client";

import { DataCard } from "@coinbase/cds-web/alpha/data-card";
import { Banner } from "@coinbase/cds-web/banner";
import { Button } from "@coinbase/cds-web/buttons";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWalletClient,
} from "wagmi";

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
    isConnected &&
      hubConfig &&
      chainId === hubConfig.chainId &&
      address &&
      publicClient &&
      walletClient,
  );

  const escrowUnset = useMemo(() => {
    if (!hubConfig?.settlementEscrowAddress) return true;
    return (
      hubConfig.settlementEscrowAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    );
  }, [hubConfig]);

  const routerConfigured = Boolean(routerBaseUrl());

  const { data: dotBalance = 0n } = useReadContract({
    address: hubConfig?.settlementEscrowAddress,
    abi: settlementEscrowAbi,
    functionName: "getDotBalances",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(chainReady && hubConfig && address && !escrowUnset),
    },
  });

  const {
    data: sessions = [],
    error,
    isFetching,
  } = useQuery({
    queryKey: [
      "userSessions",
      hubConfig?.chainId,
      hubConfig?.settlementEscrowAddress,
      address,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !address) {
        throw new Error("Missing client, config, or wallet");
      }
      const escrow = hubConfig.settlementEscrowAddress;
      const ids = await getSessionIdsForUser(publicClient, escrow, address);
      const rows = await Promise.all(
        ids.map(async (sessionId) => {
          const s = await getSession(publicClient, escrow, sessionId);
          return { sessionId, s };
        }),
      );
      return rows.sort((a, b) =>
        a.sessionId < b.sessionId ? 1 : a.sessionId > b.sessionId ? -1 : 0,
      );
    },
    enabled: Boolean(chainReady && hubConfig && !escrowUnset && !configError),
  });

  const { data: modelNameById = new Map<string, string>() } = useQuery({
    queryKey: ["modelNames", hubConfig?.modelPriceOracleAddress],
    queryFn: async () => {
      if (!publicClient || !hubConfig?.modelPriceOracleAddress) {
        return new Map<string, string>();
      }
      const models = await listNetworkModels(
        publicClient,
        hubConfig.modelPriceOracleAddress,
      );
      return new Map(models.map((m) => [m.modelId.toLowerCase(), m.name]));
    },
    enabled: Boolean(
      chainReady && hubConfig?.modelPriceOracleAddress && !escrowUnset,
    ),
  });

  function invalidateSessions() {
    void queryClient.invalidateQueries({ queryKey: ["userSessions"] });
  }

  async function showApiKeyAgain(sessionId: bigint) {
    if (!walletClient || !publicClient) return;
    setActivateError(null);
    setActivateBusyId(sessionId.toString());
    try {
      const res = await activateSessionViaPortal({
        walletClient,
        publicClient,
        sessionId,
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
      setActivateBusyId(null);
    }
  }

  const errMsg =
    error instanceof Error ? error.message : "Could not load sessions";

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/user" font="body" underline={false}>
          ← User
        </Link>

        <HStack gap={2} alignItems="center" justifyContent="space-between">
          <Text font="title2">My sessions</Text>
          <Button variant="secondary" onClick={() => setHelpOpen(true)}>
            Lost vs compromised
          </Button>
        </HStack>

        <Text font="body" color="fgMuted">
          Sessions opened by your wallet on SettlementEscrow. Close to remit
          balances; migrate after a compromised API key; show API key again only
          when the session is still open.
        </Text>

        {configError ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Config">
            <Text font="body">{configError}</Text>
          </Banner>
        ) : null}

        {hubConfig && escrowUnset && !configError ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Escrow not configured">
            <Text font="body">
              Set{" "}
              <Text as="span" font="body" mono>
                NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_*
              </Text>{" "}
              to list and manage sessions.
            </Text>
          </Banner>
        ) : null}

        {!routerConfigured ? (
          <Banner variant="warning" startIcon="warning" showDismiss={false} title="Router URL missing">
            <Text font="body">
              Set{" "}
              <Text as="span" font="body" mono>
                NEXT_PUBLIC_SPARKL_ROUTER_URL
              </Text>{" "}
              (browser) and{" "}
              <Text as="span" font="body" mono>
                SPARKL_ROUTER_URL
              </Text>{" "}
              (server) to activate sessions and show API keys.
            </Text>
          </Banner>
        ) : null}

        {!isConnected ? (
          <Banner variant="informational" startIcon="wallet" showDismiss={false} title="Connect wallet">
            <Text font="body">Connect your wallet to view your sessions.</Text>
          </Banner>
        ) : null}

        {isConnected && hubConfig && chainId !== hubConfig.chainId ? (
          <Banner variant="warning" startIcon="warning" showDismiss={false} title="Wrong network">
            <Text font="body">
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).
            </Text>
          </Banner>
        ) : null}

        {activateError ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Activate failed">
            <Text font="body">{activateError}</Text>
          </Banner>
        ) : null}

        {chainReady && !escrowUnset && error ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Load failed">
            <Text font="body">{errMsg}</Text>
          </Banner>
        ) : null}

        {chainReady && !escrowUnset && isFetching ? (
          <Text font="body" color="fgMuted">
            Loading sessions…
          </Text>
        ) : null}

        {chainReady && !escrowUnset && !isFetching && !error && sessions.length === 0 ? (
          <Text font="body" color="fgMuted">
            No sessions found for this wallet. Open a session on a node via the
            escrow contract, or lower{" "}
            <Text as="span" font="body" mono>
              NEXT_PUBLIC_SETTLEMENT_ESCROW_FROM_BLOCK
            </Text>
            .
          </Text>
        ) : null}

        {sessions.length > 0 ? (
          <VStack gap={2} alignItems="stretch">
            {sessions.map(({ sessionId, s }) => {
              const modelLabel =
                modelNameById.get(s.modelId.toLowerCase()) ??
                shortHex(s.modelId);
              const nodeHref = `/node/${encodeURIComponent(s.nodeId)}`;
              const open = !s.settled && s.lockedInternal > 0n;
              const canClose = !s.settled && s.lockedInternal > 0n;

              return (
                <DataCard key={sessionId.toString()} title={`Session ${sessionId.toString()}`}>
                  <VStack gap={1} alignItems="stretch">
                    <Text font="caption" color="fgMuted">
                      {s.settled ? "Settled" : open ? "Open" : "Closed (no lock)"} ·{" "}
                      {tierLabel(s.tier)} · {modelLabel}
                    </Text>
                    <Text font="caption" color="fgMuted" mono>
                      Node{" "}
                      <Link as={NextLink} href={nodeHref} underline>
                        {shortHex(s.nodeId)}
                      </Link>
                    </Text>
                    <Text font="caption" color="fgMuted" mono tabularNumbers>
                      Locked {formatUnits(s.lockedInternal, 18)} · Usage{" "}
                      {formatUnits(s.usageRecorded, 18)} · Paid provider{" "}
                      {formatUnits(s.paidToProviderInternal, 18)}
                    </Text>
                    <HStack gap={1} flexWrap="wrap">
                      {!s.settled ? (
                        <Button
                          variant="secondary"
                          loading={activateBusyId === sessionId.toString()}
                          disabled={!routerConfigured || !walletClient}
                          onClick={() => void showApiKeyAgain(sessionId)}
                        >
                          Show API key again
                        </Button>
                      ) : null}
                      {canClose ? (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setCloseTarget({ sessionId, session: s })
                          }
                        >
                          Close session
                        </Button>
                      ) : null}
                      {!s.settled ? (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setMigrateTarget({ sessionId, session: s })
                          }
                        >
                          Migrate (compromised)
                        </Button>
                      ) : null}
                    </HStack>
                  </VStack>
                </DataCard>
              );
            })}
          </VStack>
        ) : null}
      </VStack>

      <SessionRecoveryHelpModal
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
      />

      {apiKeyModal ? (
        <ApiKeyRevealModal
          visible
          onClose={() => setApiKeyModal(null)}
          apiKey={apiKeyModal.apiKey}
          sessionId={apiKeyModal.sessionId}
          title={apiKeyModal.title}
          description={apiKeyModal.description}
        />
      ) : null}

      {closeTarget && walletClient && publicClient && hubConfig ? (
        <CloseSessionModal
          visible
          onClose={() => setCloseTarget(null)}
          sessionId={closeTarget.sessionId}
          session={closeTarget.session}
          escrowAddress={hubConfig.settlementEscrowAddress}
          walletClient={walletClient}
          publicClient={publicClient}
          onSettled={invalidateSessions}
        />
      ) : null}

      {migrateTarget &&
      walletClient &&
      publicClient &&
      hubConfig &&
      !escrowUnset ? (
        <MigrateSessionModal
          visible
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
      ) : null}
    </Box>
  );
}
