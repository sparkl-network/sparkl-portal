"use client";

import { DataCard } from "@coinbase/cds-web/alpha/data-card";
import { Banner } from "@coinbase/cds-web/banner";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { formatUnits, getAddress, isAddress, zeroHash } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import { shortNodeId } from "@/lib/formatAddress";
import { getOperatorNodeDetailRows } from "@/lib/evm/registry";
import { registryMetadataUriToFetchUrl } from "@/lib/nodeBaseUrl";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

function teeProofSubmitted(hash: `0x${string}`): boolean {
  return hash.toLowerCase() !== zeroHash.toLowerCase();
}

export default function ProviderDetailPage() {
  const params = useParams();
  const raw =
    typeof params.operator === "string"
      ? params.operator
      : Array.isArray(params.operator)
        ? params.operator[0]
        : "";

  const operatorAddress = useMemo(() => {
    const s = raw.trim();
    if (!s || !isAddress(s)) return null;
    try {
      return getAddress(s);
    } catch {
      return null;
    }
  }, [raw]);

  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { hubConfig, configError } = useHubChainConfig();

  const chainMatches = Boolean(hubConfig && chainId === hubConfig.chainId);
  const registryUnset = Boolean(
    !hubConfig ||
      !hubConfig.providerRegistryAddress ||
      hubConfig.providerRegistryAddress.toLowerCase() ===
        ZERO_ADDRESS.toLowerCase(),
  );

  const dotLabel = hubConfig?.nativeCurrency.symbol ?? "DOT";
  const dec = hubConfig?.nativeCurrency.decimals ?? 10;

  const formatTierPrice = (wei: bigint | null) => {
    if (wei === null) return "—";
    try {
      return `${formatUnits(wei, dec)} ${dotLabel} / 1k`;
    } catch {
      return "—";
    }
  };

  const {
    data,
    error,
    isFetching,
  } = useQuery({
    queryKey: [
      "providerDetail",
      hubConfig?.chainId,
      hubConfig?.providerRegistryAddress,
      operatorAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !operatorAddress) {
        throw new Error("Missing client, config, or operator");
      }
      const rows = await getOperatorNodeDetailRows(
        publicClient,
        hubConfig.providerRegistryAddress,
        operatorAddress,
      );

      const regionByNodeId = new Map<string, string | null>();
      await Promise.all(
        rows.map(async ({ nodeId, info }) => {
          const uri = info.metadataURI?.trim() ?? "";
          const fetchUrl = registryMetadataUriToFetchUrl(uri);
          if (!fetchUrl) {
            regionByNodeId.set(nodeId.toLowerCase(), null);
            return;
          }
          try {
            const r = await fetch(
              `/api/provider-metadata?url=${encodeURIComponent(fetchUrl)}`,
            );
            const j: unknown = await r.json();
            const region =
              j && typeof j === "object" && "region" in j
                ? typeof (j as { region?: unknown }).region === "string"
                  ? ((j as { region: string }).region)
                  : null
                : null;
            regionByNodeId.set(nodeId.toLowerCase(), region);
          } catch {
            regionByNodeId.set(nodeId.toLowerCase(), null);
          }
        }),
      );

      return { rows, regionByNodeId };
    },
    enabled: Boolean(
      isConnected &&
        operatorAddress &&
        hubConfig &&
        publicClient &&
        chainMatches &&
        !registryUnset &&
        !configError,
    ),
  });

  const errMsg =
    error instanceof Error ? error.message : "Could not load this operator account";

  const rows = data?.rows ?? [];
  const regionByNodeId = data?.regionByNodeId;

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/provider" font="body" underline={false}>
          ← Providers
        </Link>

        {!operatorAddress ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Invalid operator">
            <Text font="body">This URL must include a valid operator (wallet) address.</Text>
          </Banner>
        ) : (
          <VStack gap={0} alignItems="flex-start">
            <Text font="label2" color="fgMuted">
              Operator account
            </Text>
            <Text font="title2" mono tabularNumbers>
              {operatorAddress}
            </Text>
          </VStack>
        )}

        {configError ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Configuration error">
            <Text font="body">{configError}</Text>
          </Banner>
        ) : null}

        {hubConfig && registryUnset && !configError ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Registry missing">
            <Text font="body">Set ProviderRegistry in env and restart.</Text>
          </Banner>
        ) : null}

        {!isConnected ? (
          <Banner variant="informational" startIcon="wallet" showDismiss={false} title="Wallet disconnected">
            <Text font="body">Connect on the hub chain to load this operator account.</Text>
          </Banner>
        ) : null}

        {isConnected && hubConfig && !chainMatches ? (
          <Banner variant="warning" startIcon="warning" showDismiss={false} title="Wrong network">
            <Text font="body">
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).
            </Text>
          </Banner>
        ) : null}

        {operatorAddress && isConnected && chainMatches && !registryUnset && error ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Load failed">
            <Text font="body">{errMsg}</Text>
          </Banner>
        ) : null}

        {operatorAddress && isConnected && chainMatches && !registryUnset && isFetching ? (
          <Text font="body" color="fgMuted">
            Loading…
          </Text>
        ) : null}

        <Box
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
            width: "100%",
          }}
        >
          <DataCard
            layout="vertical"
            title={
              <Text font="label2" color="fgMuted">
                Reputation
              </Text>
            }
            subtitle={
              <Text font="body" color="fgMuted">
                Off-chain indexing not wired yet. Planned signals: uptime, error
                rate, settlement timeliness vs peers.
              </Text>
            }
          />
          <DataCard
            layout="vertical"
            title={
              <Text font="label2" color="fgMuted">
                Slashes
              </Text>
            }
            subtitle={
              <Text font="body" color="fgMuted">
                No slashing module in current WIP contracts. Future: on-chain
                penalties or curated admin flags.
              </Text>
            }
          />
        </Box>

        {rows.length > 0 ? (
          <VStack gap={2} alignItems="stretch" width="100%">
            <Text font="label2" color="fgMuted">
              Nodes
            </Text>
            {rows.map(({ nodeId, info, bestEffortPrice, teePrice }) => {
              const registered =
                info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
              const region =
                regionByNodeId?.get(nodeId.toLowerCase()) ?? null;
              return (
                <Box key={nodeId} bordered borderRadius={400} padding={2}>
                  <HStack
                    justifyContent="space-between"
                    alignItems="flex-start"
                    gap={2}
                    style={{ flexWrap: "wrap" }}
                  >
                    <VStack gap={1} alignItems="flex-start" style={{ minWidth: 0 }}>
                      <Link
                        as={NextLink}
                        href={`/node/${nodeId}`}
                        font="body"
                        underline
                      >
                        {shortNodeId(nodeId)}
                      </Link>
                      <Text font="caption" mono tabularNumbers color="fgMuted" style={{ wordBreak: "break-all" }}>
                        {nodeId}
                      </Text>
                    </VStack>
                    <Text font="caption" color="fgMuted">
                      {registered
                        ? info.active
                          ? "Active"
                          : "Inactive"
                        : "Unregistered"}
                    </Text>
                  </HStack>

                  <VStack gap={1} paddingTop={2}>
                    <Text font="caption" color="fgMuted">
                      Best Effort: {formatTierPrice(bestEffortPrice)} · TEE:{" "}
                      {formatTierPrice(teePrice)}
                    </Text>
                    <Text font="caption" color="fgMuted">
                      TEE advertised: {info.supportsTEE ? "yes" : "no"} · proof:{" "}
                      {teeProofSubmitted(info.teeReportHash) ? "set" : "none"}
                    </Text>
                    <Text font="caption" color="fgMuted">
                      Region (/details): {region ?? "—"}
                    </Text>
                    {info.metadataURI ? (
                      <Text font="caption" mono color="fgMuted" style={{ wordBreak: "break-all" }}>
                        {info.metadataURI}
                      </Text>
                    ) : null}
                  </VStack>
                </Box>
              );
            })}
          </VStack>
        ) : null}

        {operatorAddress &&
        isConnected &&
        chainMatches &&
        !registryUnset &&
        !isFetching &&
        !error &&
        rows.length === 0 ? (
          <Text font="body" color="fgMuted">
            No nodes for this operator account (
            <Text as="span" font="body" mono>
              operatorNodes
            </Text>{" "}
            empty).
          </Text>
        ) : null}
      </VStack>
    </Box>
  );
}
