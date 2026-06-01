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

import { OperatorDirectoryTable } from "@/components/operators/OperatorDirectoryTable";
import { ZERO_ADDRESS, chainRpcUrl } from "@/lib/chains";
import {
  countNodeRegisteredLogs,
  getOperatorDirectoryEntries,
  getOperatorNodes,
} from "@/lib/evm/registry";
import { shortAddress } from "@/lib/formatAddress";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

export default function OperatorDirectoryPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { hubConfig, configError } = useHubChainConfig();

  const chainMatches = Boolean(hubConfig && chainId === hubConfig.chainId);
  const registryUnset = Boolean(
    !hubConfig ||
      !hubConfig.operatorRegistryAddress ||
      hubConfig.operatorRegistryAddress.toLowerCase() ===
        ZERO_ADDRESS.toLowerCase(),
  );

  const {
    data: logStats,
  } = useQuery({
    queryKey: [
      "operatorLogStats",
      hubConfig?.chainId,
      hubConfig?.operatorRegistryAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig) {
        throw new Error("Missing RPC client or hub config");
      }
      const count = await countNodeRegisteredLogs(
        publicClient,
        hubConfig.operatorRegistryAddress,
      );
      const fromBlock =
        process.env.NEXT_PUBLIC_OPERATOR_REGISTRY_FROM_BLOCK ??
        process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_FROM_BLOCK ??
        "0";
      return { count, fromBlock };
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

  const { data: myNodeIds = [] } = useQuery({
    queryKey: [
      "myOperatorNodes",
      hubConfig?.chainId,
      hubConfig?.operatorRegistryAddress,
      address,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !address) {
        throw new Error("Missing client, config, or wallet");
      }
      return getOperatorNodes(
        publicClient,
        hubConfig.operatorRegistryAddress,
        address,
      );
    },
    enabled: Boolean(
      isConnected &&
        hubConfig &&
        publicClient &&
        chainMatches &&
        !registryUnset &&
        !configError &&
        address,
    ),
  });

  const {
    data: rows = [],
    error,
    isFetching,
  } = useQuery({
    queryKey: [
      "operatorDirectory",
      hubConfig?.chainId,
      hubConfig?.operatorRegistryAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig) {
        throw new Error("Missing RPC client or hub config");
      }
      return getOperatorDirectoryEntries(
        publicClient,
        hubConfig.operatorRegistryAddress,
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
          <Text font="title2">Operators</Text>
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
              Set OperatorRegistry in <Text as="span" font="body" mono>.env.local</Text> and restart.
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
            <OperatorDirectoryTable rows={rows} />
          </VStack>
        ) : null}

        {isConnected && chainMatches && !registryUnset && !isFetching && !error && rows.length === 0 ? (
          <VStack gap={2} alignItems="flex-start">
            <Banner variant="informational" showDismiss={false} bordered title="No operators yet">
              <VStack gap={1} alignItems="flex-start">
                <Text font="body">
                  The directory lists wallets that emitted{" "}
                  <Text as="span" font="body" mono>
                    NodeRegistered
                  </Text>{" "}
                  on{" "}
                  <Text as="span" font="body" mono>
                    {hubConfig ? chainRpcUrl(hubConfig) : "the chain RPC"}
                  </Text>
                  . A deployed registry with no registrations looks like this — it is not a load error.
                </Text>
                {logStats !== undefined ? (
                  <Text font="caption" color="fgMuted">
                    Found {logStats.count.toString()} registration event
                    {logStats.count === 1n ? "" : "s"} from block {logStats.fromBlock}.
                  </Text>
                ) : null}
                <Text font="body">
                  Register a node at{" "}
                  <Link as={NextLink} href="/node/register" font="body">
                    /node/register
                  </Link>{" "}
                  using the same chain and registry address as in{" "}
                  <Text as="span" font="body" mono>
                    .env.local
                  </Text>
                  , then refresh this page.
                </Text>
              </VStack>
            </Banner>
            {myNodeIds.length > 0 && address ? (
              <Banner variant="warning" showDismiss={false} bordered title="Your wallet has on-chain nodes">
                <Text font="body">
                  {shortAddress(address)} has {myNodeIds.length} node
                  {myNodeIds.length === 1 ? "" : "s"} via{" "}
                  <Text as="span" font="body" mono>
                    operatorNodes
                  </Text>{" "}
                  , but no matching registration logs were found (check registry address / FROM_BLOCK / RPC).
                </Text>
              </Banner>
            ) : null}
          </VStack>
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
