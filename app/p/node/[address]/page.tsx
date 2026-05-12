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
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import { getPricePer1k, getProvider } from "@/lib/evm/registry";
import { SecurityTier } from "@/lib/types";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

function teeProofSubmitted(hash: `0x${string}`): boolean {
  return hash.toLowerCase() !== zeroHash.toLowerCase();
}

export default function ProviderNodeDetailPage() {
  const params = useParams();
  const raw =
    typeof params.address === "string"
      ? params.address
      : Array.isArray(params.address)
        ? params.address[0]
        : "";
  const providerAddressValid = useMemo(() => {
    if (!raw || !isAddress(raw)) return null;
    try {
      return getAddress(raw);
    } catch {
      return null;
    }
  }, [raw]);

  const { address: connected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  void walletClient;
  const { hubConfig, configError } = useHubChainConfig();

  const chainReady = Boolean(
    hubConfig && chainId === hubConfig.chainId && connected,
  );

  const registryUnset = useMemo(() => {
    if (!hubConfig?.providerRegistryAddress) return true;
    return (
      hubConfig.providerRegistryAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    );
  }, [hubConfig]);

  const {
    data: providerData,
    error: providerQueryError,
    isFetching: providerLoading,
  } = useQuery({
    queryKey: [
      "providerNodeDetail",
      hubConfig?.chainId,
      hubConfig?.providerRegistryAddress,
      providerAddressValid,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !providerAddressValid) {
        throw new Error("Missing RPC client, hub config, or provider address");
      }
      const info = await getProvider(
        publicClient,
        hubConfig.providerRegistryAddress,
        providerAddressValid,
      );
      const isRegistered =
        info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();

      let bestEffortPrice: bigint | null = null;
      let teePrice: bigint | null = null;
      if (isRegistered) {
        try {
          bestEffortPrice = await getPricePer1k(
            publicClient,
            hubConfig.providerRegistryAddress,
            providerAddressValid,
            SecurityTier.BEST_EFFORT,
          );
        } catch {
          bestEffortPrice = null;
        }
        try {
          teePrice = await getPricePer1k(
            publicClient,
            hubConfig.providerRegistryAddress,
            providerAddressValid,
            SecurityTier.TEE_VERIFIED,
          );
        } catch {
          teePrice = null;
        }
      }

      return { info, isRegistered, bestEffortPrice, teePrice };
    },
    enabled: Boolean(
      chainReady &&
        hubConfig &&
        providerAddressValid &&
        publicClient &&
        !registryUnset &&
        !configError,
    ),
  });

  const dotLabel = hubConfig?.nativeCurrency.symbol ?? "DOT";
  const dec = hubConfig?.nativeCurrency.decimals ?? 10;

  const formatPrice = (wei: bigint | null) => {
    if (wei === null) return "—";
    try {
      return `${formatUnits(wei, dec)} ${dotLabel} / 1k tokens`;
    } catch {
      return "—";
    }
  };

  const providerErrMsg =
    providerQueryError instanceof Error
      ? providerQueryError.message
      : "Could not load provider";

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/p" font="body" underline={false}>
          ← Providers
        </Link>

        <Text font="title2">Node details</Text>

        {!providerAddressValid ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Invalid address"
          >
            <Text font="body">
              This URL does not contain a valid provider (node) address.
            </Text>
          </Banner>
        ) : (
          <Text font="caption" mono tabularNumbers color="fgMuted">
            {providerAddressValid}
          </Text>
        )}

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

        {connected && hubConfig && chainId !== hubConfig.chainId ? (
          <Banner
            variant="warning"
            startIcon="warning"
            showDismiss={false}
            title="Wrong network"
          >
            <Text font="body">
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}) to
              load on-chain data.
            </Text>
          </Banner>
        ) : null}

        {!connected ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="Wallet disconnected"
          >
            <Text font="body">
              Connect your wallet to read registry data from the hub chain.
            </Text>
          </Banner>
        ) : null}

        {providerAddressValid &&
        chainReady &&
        !registryUnset &&
        !configError &&
        providerQueryError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Registry read failed"
          >
            <Text font="body">{providerErrMsg}</Text>
          </Banner>
        ) : null}

        {providerAddressValid &&
        chainReady &&
        !registryUnset &&
        !configError &&
        providerLoading ? (
          <Text font="body" color="fgMuted">
            Loading provider…
          </Text>
        ) : null}

        {providerAddressValid &&
        chainReady &&
        !registryUnset &&
        !configError &&
        !providerLoading &&
        !providerQueryError &&
        providerData &&
        !providerData.isRegistered ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="Not registered"
          >
            <Text font="body">
              There is no ProviderRegistry entry for this address.
            </Text>
          </Banner>
        ) : null}

        {providerAddressValid &&
        chainReady &&
        !registryUnset &&
        !configError &&
        !providerLoading &&
        !providerQueryError &&
        providerData?.isRegistered ? (
          <>
            <Box
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
                width: "100%",
              }}
            >
              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Active status
                  </Text>
                }
                subtitle={
                  <HStack gap={2} alignItems="center">
                    <Box
                      width={8}
                      height={8}
                      style={{
                        borderRadius: 9999,
                        backgroundColor: providerData.info.active
                          ? "#16a34a"
                          : "#dc2626",
                        flexShrink: 0,
                      }}
                    />
                    <Text font="title3">
                      {providerData.info.active ? "Active" : "Inactive"}
                    </Text>
                  </HStack>
                }
              />

              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Payout address
                  </Text>
                }
                subtitle={
                  <Text font="title3" mono tabularNumbers>
                    {providerData.info.payout}
                  </Text>
                }
              />

              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Best Effort price
                  </Text>
                }
                subtitle={
                  <Text font="title3" mono tabularNumbers>
                    {formatPrice(providerData.bestEffortPrice)}
                  </Text>
                }
              />

              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    TEE price
                  </Text>
                }
                subtitle={
                  <Text font="title3" mono tabularNumbers>
                    {formatPrice(providerData.teePrice)}
                  </Text>
                }
              />

              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    TEE proof status
                  </Text>
                }
                subtitle={
                  <VStack gap={1} alignItems="flex-start">
                    <Text font="title3">
                      {teeProofSubmitted(providerData.info.teeReportHash)
                        ? "Submitted"
                        : "Not submitted"}
                    </Text>
                    {teeProofSubmitted(providerData.info.teeReportHash) ? (
                      <Text font="caption" mono tabularNumbers color="fgMuted">
                        {providerData.info.teeReportHash}
                      </Text>
                    ) : null}
                  </VStack>
                }
              />
            </Box>

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
          </>
        ) : null}
      </VStack>
    </Box>
  );
}
