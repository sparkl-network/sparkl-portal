"use client";

import { Banner } from "@coinbase/cds-web/banner";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";

import {
  useAccount,
  useChainId,
  usePublicClient,
} from "wagmi";

import { ProviderDirectoryTable } from "@/components/providers/ProviderDirectoryTable";
import { ZERO_ADDRESS } from "@/lib/chains";
import { getOperatorDirectoryEntries } from "@/lib/evm/registry";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

export default function ProviderDirectoryPage() {
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

  const {
    data: rows = [],
    error,
    isFetching,
  } = useQuery({
    queryKey: [
      "providerDirectory",
      hubConfig?.chainId,
      hubConfig?.providerRegistryAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig) {
        throw new Error("Missing RPC client or hub config");
      }
      return getOperatorDirectoryEntries(
        publicClient,
        hubConfig.providerRegistryAddress,
      );
    },
    enabled: Boolean(
      isConnected &&
        hubConfig &&
        publicClient &&
        chainMatches &&
        !registryUnset &&
        !configError,
    ),
  });

  const errMsg =
    error instanceof Error ? error.message : "Could not load operator accounts";

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>

        <VStack gap={1} alignItems="flex-start">
          <Text font="title2">Providers</Text>
          <Text font="label2" color="fgMuted">
            Operator accounts
          </Text>
          <Text font="body" color="fgMuted">
            Wallets that have registered at least one node. Operators are derived from
            NodeRegistered logs; each account’s nodes use on-chain{" "}
            <Text as="span" font="body" mono>
              operatorNodes
            </Text>
            .
          </Text>
        </VStack>

        {configError ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Configuration error">
            <Text font="body">{configError}</Text>
          </Banner>
        ) : null}

        {hubConfig && registryUnset && !configError ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Registry missing">
            <Text font="body">
              Set ProviderRegistry in <Text as="span" font="body" mono>.env</Text> and restart.
            </Text>
          </Banner>
        ) : null}

        {!isConnected ? (
          <Banner variant="informational" startIcon="wallet" showDismiss={false} title="Wallet disconnected">
            <Text font="body">Connect on the hub chain to load the directory.</Text>
          </Banner>
        ) : null}

        {isConnected && hubConfig && !chainMatches ? (
          <Banner variant="warning" startIcon="warning" showDismiss={false} title="Wrong network">
            <Text font="body">
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).
            </Text>
          </Banner>
        ) : null}

        {isConnected && chainMatches && !registryUnset && error ? (
          <Banner variant="error" startIcon="warning" showDismiss={false} title="Load failed">
            <Text font="body">{errMsg}</Text>
          </Banner>
        ) : null}

        {isConnected && chainMatches && !registryUnset && isFetching ? (
          <Text font="body" color="fgMuted">
            Loading operator accounts…
          </Text>
        ) : null}

        {rows.length > 0 ? (
          <VStack gap={2} alignItems="stretch" width="100%">
            <Text font="caption" color="fgMuted">
              {rows.length} operator{rows.length === 1 ? "" : "s"}
            </Text>
            <ProviderDirectoryTable rows={rows} />
          </VStack>
        ) : null}

        {isConnected && chainMatches && !registryUnset && !isFetching && !error && rows.length === 0 ? (
          <Text font="body" color="fgMuted">
            No operators found from registry logs (
            <Text as="span" font="body" mono>
              NEXT_PUBLIC_PROVIDER_REGISTRY_FROM_BLOCK
            </Text>{" "}
            controls start block).
          </Text>
        ) : null}

        <HStack gap={2} style={{ flexWrap: "wrap" }}>
          <Link as={NextLink} href="/node" font="body">
            Your nodes
          </Link>
        </HStack>
      </VStack>
    </Box>
  );
}
