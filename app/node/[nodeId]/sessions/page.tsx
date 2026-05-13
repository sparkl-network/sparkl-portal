"use client";

import { Banner } from "@coinbase/cds-web/banner";
import { Box, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { formatUnits } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import { getSession, getSessionIdsForNode } from "@/lib/evm/escrow";
import { parseNodeIdRouteSegment } from "@/lib/nodeId";
import { SecurityTier } from "@/lib/types";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

function tierLabel(t: SecurityTier): string {
  return t === SecurityTier.BEST_EFFORT ? "Best Effort" : "TEE verified";
}

export default function NodeSessionsPage() {
  const params = useParams();
  const raw =
    typeof params.nodeId === "string"
      ? params.nodeId
      : Array.isArray(params.nodeId)
        ? params.nodeId[0]
        : "";

  const parsedRoute = useMemo(() => parseNodeIdRouteSegment(raw), [raw]);
  const nodeIdFromRoute = parsedRoute.nodeId;
  const pathSegmentForLinks = useMemo(() => {
    if (!nodeIdFromRoute) return "";
    return parsedRoute.peerIdDisplay ?? nodeIdFromRoute;
  }, [nodeIdFromRoute, parsedRoute.peerIdDisplay]);

  const backHref =
    nodeIdFromRoute && pathSegmentForLinks
      ? `/node/${encodeURIComponent(pathSegmentForLinks)}`
      : "/node";

  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { hubConfig, configError } = useHubChainConfig();

  const chainReady = Boolean(
    hubConfig && chainId === hubConfig.chainId && isConnected,
  );

  const registryUnset = useMemo(() => {
    if (!hubConfig?.providerRegistryAddress) return true;
    return (
      hubConfig.providerRegistryAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    );
  }, [hubConfig]);

  const escrowUnset = useMemo(() => {
    if (!hubConfig?.settlementEscrowAddress) return true;
    return (
      hubConfig.settlementEscrowAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    );
  }, [hubConfig]);

  const {
    data: sessions = [],
    error,
    isFetching,
  } = useQuery({
    queryKey: [
      "nodeSessions",
      hubConfig?.chainId,
      hubConfig?.settlementEscrowAddress,
      nodeIdFromRoute,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !nodeIdFromRoute) {
        throw new Error("Missing client, config, or node ID");
      }
      const escrow = hubConfig.settlementEscrowAddress;
      const ids = await getSessionIdsForNode(
        publicClient,
        escrow,
        nodeIdFromRoute,
      );
      const rows = await Promise.all(
        ids.map(async (sessionId) => {
          const s = await getSession(publicClient, escrow, sessionId);
          return { sessionId, s };
        }),
      );
      return rows;
    },
    enabled: Boolean(
      chainReady &&
        hubConfig &&
        nodeIdFromRoute &&
        publicClient &&
        !registryUnset &&
        !escrowUnset &&
        !configError,
    ),
  });

  const errMsg =
    error instanceof Error ? error.message : "Could not load sessions";

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link
          as={NextLink}
          href={backHref}
          font="body"
          underline={false}
        >
          ← Node
        </Link>

        <Text font="title2">Sessions (dev)</Text>
        <Text font="body" color="fgMuted">
          Open sessions for this node id from{" "}
          <Text as="span" font="body" mono>
            SessionOpened
          </Text>{" "}
          logs on SettlementEscrow.
        </Text>

        {!nodeIdFromRoute ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Invalid node ID"
          >
            <Text font="body">Check the URL segment for this page.</Text>
          </Banner>
        ) : null}

        {configError ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Config">
            <Text font="body">{configError}</Text>
          </Banner>
        ) : null}

        {hubConfig && escrowUnset && !configError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Settlement escrow missing"
          >
            <Text font="body">
              Set escrow address in env to index session events.
            </Text>
          </Banner>
        ) : null}

        {!isConnected ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="Wallet disconnected"
          >
            <Text font="body">Connect to query the hub chain.</Text>
          </Banner>
        ) : null}

        {isConnected && hubConfig && chainId !== hubConfig.chainId ? (
          <Banner variant="warning" startIcon="warning" showDismiss={false} title="Wrong network">
            <Text font="body">
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).
            </Text>
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
            No sessions found for this node (from logs). Open a session on escrow
            first, or lower{" "}
            <Text as="span" font="body" mono>
              NEXT_PUBLIC_SETTLEMENT_ESCROW_FROM_BLOCK
            </Text>
            .
          </Text>
        ) : null}

        {sessions.length > 0 ? (
          <VStack gap={2} alignItems="stretch">
            {sessions.map(({ sessionId, s }) => (
              <Box key={sessionId.toString()} bordered borderRadius={400} padding={2}>
                <Text font="label2" mono tabularNumbers>
                  Session {sessionId.toString()}
                </Text>
                <Text font="caption" color="fgMuted" mono>
                  user {s.user} · tier {tierLabel(s.tier)} · settled{" "}
                  {s.settled ? "yes" : "no"}
                </Text>
                <Text font="caption" color="fgMuted" mono>
                  locked {formatUnits(s.lockedInternal, 18)} · usage{" "}
                  {formatUnits(s.usageRecorded, 18)} · paid provider{" "}
                  {formatUnits(s.paidToProviderInternal, 18)}
                </Text>
              </Box>
            ))}
          </VStack>
        ) : null}
      </VStack>
    </Box>
  );
}
