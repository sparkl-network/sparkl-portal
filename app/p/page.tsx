"use client";

import { ListCell } from "@coinbase/cds-web/cells";
import { Banner } from "@coinbase/cds-web/banner";
import { Button } from "@coinbase/cds-web/buttons";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import { shortAddress } from "@/lib/formatAddress";
import {
  getProvider,
  getProvidersLinkedToAccount,
} from "@/lib/evm/registry";
import {
  readProviderWatchlist,
  removeProviderFromWatchlist,
  subscribeProviderWatchlist,
} from "@/lib/providerWatchlist";
import type { RegisteredProvider } from "@/lib/types";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

export default function ProviderHome() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  void walletClient;
  const { hubConfig, configError } = useHubChainConfig();

  const [watchRev, setWatchRev] = useState(0);
  useEffect(() => subscribeProviderWatchlist(() => setWatchRev((n) => n + 1)), []);

  const chainReady = Boolean(
    isConnected &&
      hubConfig &&
      chainId === hubConfig.chainId &&
      address,
  );

  const registryUnset = useMemo(() => {
    if (!hubConfig?.providerRegistryAddress) return true;
    return (
      hubConfig.providerRegistryAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    );
  }, [hubConfig]);

  const watchlistAddresses = useMemo(() => {
    if (!address || !hubConfig) return [];
    return readProviderWatchlist(address, hubConfig.chainId);
  }, [address, hubConfig]);

  const {
    data: mergedNodes = [],
    error: listError,
    isFetching: listLoading,
  } = useQuery({
    queryKey: [
      "providersLinked",
      hubConfig?.chainId,
      hubConfig?.providerRegistryAddress,
      address,
      watchlistAddresses.join(","),
      watchRev,
    ],
    queryFn: async (): Promise<RegisteredProvider[]> => {
      if (!publicClient || !hubConfig || !address) {
        throw new Error("Missing RPC client, hub config, or wallet address");
      }
      const linked = await getProvidersLinkedToAccount(
        publicClient,
        hubConfig.providerRegistryAddress,
        address,
      );
      const linkedSet = new Set(
        linked.map((p) => p.address.toLowerCase()),
      );
      const extra: RegisteredProvider[] = [];
      for (const op of watchlistAddresses) {
        if (linkedSet.has(op.toLowerCase())) continue;
        const info = await getProvider(
          publicClient,
          hubConfig.providerRegistryAddress,
          op,
        );
        extra.push({ address: op, info });
      }
      return [...linked, ...extra].sort((a, b) =>
        a.address.toLowerCase().localeCompare(b.address.toLowerCase()),
      );
    },
    enabled: Boolean(
      chainReady &&
        hubConfig &&
        address &&
        publicClient &&
        !registryUnset &&
        !configError,
    ),
  });

  const watchSet = useMemo(
    () => new Set(watchlistAddresses.map((a) => a.toLowerCase())),
    [watchlistAddresses],
  );

  function removeTracked(operator: `0x${string}`) {
    if (!address || !hubConfig) return;
    removeProviderFromWatchlist(address, hubConfig.chainId, operator);
  }

  const listErrMsg =
    listError instanceof Error ? listError.message : "Could not load providers";

  const showAddButton = Boolean(
    chainReady && hubConfig && !registryUnset && !configError,
  );

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/" font="body" underline={false}>
          ← Home
        </Link>

        <HStack
          alignItems="flex-start"
          justifyContent="space-between"
          gap={2}
          style={{ flexWrap: "wrap", width: "100%" }}
        >
          <VStack gap={1} alignItems="flex-start">
            <Text font="title2">Provider</Text>
            <Text font="body" color="fgMuted">
              Nodes from the registry that pay out to or are operated by this
              wallet, plus operators you add under Register → Portfolio.
            </Text>
          </VStack>
          {showAddButton ? (
            <NextLink href="/p/register" style={{ textDecoration: "none" }}>
              <Button
                variant="primary"
                compact
                startIcon="add"
                accessibilityLabel="Register a new node"
              >
                Add node
              </Button>
            </NextLink>
          ) : null}
        </HStack>

        {configError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Configuration error"
          >
            <Text font="body">{configError}</Text>
          </Banner>
        ) : null}

        {hubConfig && registryUnset && !configError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Provider registry address missing"
          >
            <Text font="body">
              Set a deployed ProviderRegistry in your env (see .env.example),
              then restart the dev server.
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
            <Text font="body">
              Connect a wallet from the toolbar to see nodes linked to your
              account.
            </Text>
          </Banner>
        ) : null}

        {isConnected && hubConfig && chainId !== hubConfig.chainId ? (
          <Banner
            variant="warning"
            startIcon="warning"
            showDismiss={false}
            title="Wrong network"
          >
            <Text font="body">
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}) for
              provider actions.
            </Text>
          </Banner>
        ) : null}

        {address ? (
          <HStack gap={1}>
            <Text font="caption" color="fgMuted">
              Connected
            </Text>
            <Text font="caption" mono tabularNumbers>
              {address}
            </Text>
          </HStack>
        ) : null}

        {chainReady && !registryUnset && !configError && listError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Registry read failed"
          >
            <Text font="body">{listErrMsg}</Text>
          </Banner>
        ) : null}

        {chainReady && !registryUnset && !configError && listLoading ? (
          <Text font="body" color="fgMuted">
            Loading nodes…
          </Text>
        ) : null}

        {chainReady &&
        !registryUnset &&
        !configError &&
        !listLoading &&
        !listError &&
        mergedNodes.length === 0 ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="Register your node"
          >
            <VStack gap={2} alignItems="flex-start">
              <Text font="body" color="fgMuted">
                No nodes yet. Register this wallet as an operator, or add other
                operators from{" "}
                <Link as={NextLink} href="/p/register" font="body" underline>
                  Register → Portfolio
                </Link>{" "}
                to track them here (same payout account is fine).
              </Text>
              <NextLink href="/p/register" style={{ textDecoration: "none" }}>
                <Button variant="primary">Register your node</Button>
              </NextLink>
            </VStack>
          </Banner>
        ) : null}

        {chainReady &&
        !registryUnset &&
        !configError &&
        !listLoading &&
        !listError &&
        mergedNodes.length > 0 ? (
          <VStack gap={1} alignItems="stretch" width="100%">
            <Text font="label2" color="fgMuted">
              Your nodes
            </Text>
            <VStack gap={0} alignItems="stretch">
              {mergedNodes.map(({ address: operator, info }) => {
                const isTrackedOnly = watchSet.has(operator.toLowerCase());
                const isUnregistered =
                  info.payout.toLowerCase() === ZERO_ADDRESS.toLowerCase();
                const subtitle = isUnregistered
                  ? "Not registered"
                  : info.active
                    ? "Active"
                    : "Inactive";
                const description = isUnregistered
                  ? "No on-chain payout yet"
                  : `Payout ${shortAddress(info.payout)} · BE ${info.supportsBestEffort ? "Y" : "N"} · TEE ${info.supportsTEE ? "Y" : "N"}`;

                return (
                  <Box
                    key={operator}
                    borderedBottom
                    borderColor="bgLineHeavy"
                  >
                    <HStack
                      alignItems="stretch"
                      gap={0}
                      width="100%"
                    >
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <ListCell
                          as={NextLink}
                          href={`/p/node/${operator}`}
                          spacingVariant="condensed"
                          accessory="arrow"
                          media={
                            <Box
                              width={8}
                              height={8}
                              style={{
                                borderRadius: 9999,
                                alignSelf: "center",
                                backgroundColor:
                                  !isUnregistered && info.active
                                    ? "#16a34a"
                                    : "#dc2626",
                                flexShrink: 0,
                              }}
                            />
                          }
                          title={shortAddress(operator)}
                          subtitle={subtitle}
                          description={description}
                        />
                      </Box>
                      {isTrackedOnly ? (
                        <HStack alignItems="center" paddingEnd={2}>
                          <Button
                            variant="tertiary"
                            compact
                            type="button"
                            onClick={() => removeTracked(operator)}
                          >
                            Remove
                          </Button>
                        </HStack>
                      ) : null}
                    </HStack>
                  </Box>
                );
              })}
            </VStack>
          </VStack>
        ) : null}

        <VStack gap={1} alignItems="flex-start">
          <Text font="label2" color="fgMuted">
            Provider pages
          </Text>
          <HStack gap={2} style={{ flexWrap: "wrap" }}>
            <Link as={NextLink} href="/p/register" font="body">
              Register
            </Link>
            <Text font="body" color="fgMuted">
              ·
            </Text>
            <Link as={NextLink} href="/p/settings" font="body">
              Settings
            </Link>
            <Text font="body" color="fgMuted">
              ·
            </Text>
            <Link as={NextLink} href="/p/pricing" font="body">
              Pricing
            </Link>
            <Text font="body" color="fgMuted">
              ·
            </Text>
            <Link as={NextLink} href="/p/sessions" font="body">
              Sessions
            </Link>
          </HStack>
        </VStack>
      </VStack>
    </Box>
  );
}
