"use client";

import { DataCard } from "@coinbase/cds-web/alpha/data-card";
import { Banner } from "@coinbase/cds-web/banner";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Text } from "@coinbase/cds-web/typography";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import {
  MVP_DEFAULT_INPUT_PER_1M_USD,
  MVP_DEFAULT_OUTPUT_PER_1M_USD,
  listNetworkModels,
  readDefaultModelPrice,
} from "@/lib/evm/modelOracle";
import { readTeePriceMultiplierBps } from "@/lib/evm/escrow";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

const INTERNAL_DOT_DECIMALS = 18;

function formatModelPrice(wei: bigint, symbol: string): string {
  try {
    return `${formatUnits(wei, INTERNAL_DOT_DECIMALS)} ${symbol} / 1k`;
  } catch {
    return "—";
  }
}

function formatUsdPerM(usd: number): string {
  const cents = Math.round(usd * 100);
  if (cents < 100) return `${cents}¢`;
  return `$${usd.toFixed(2)}`;
}

export default function ModelPage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { hubConfig, configError } = useHubChainConfig();

  const chainMatches = Boolean(hubConfig && chainId === hubConfig.chainId);
  const oracleUnset = Boolean(
    !hubConfig ||
      !hubConfig.modelPriceOracleAddress ||
      hubConfig.modelPriceOracleAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase(),
  );

  const dotLabel = hubConfig?.nativeCurrency.symbol ?? "DOT";

  const {
    data: defaultPrice,
    error: defaultError,
    isFetching: defaultFetching,
  } = useQuery({
    queryKey: [
      "defaultModelPrice",
      hubConfig?.chainId,
      hubConfig?.modelPriceOracleAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig) {
        throw new Error("Missing RPC client or hub config");
      }
      return readDefaultModelPrice(
        publicClient,
        hubConfig.modelPriceOracleAddress,
      );
    },
    enabled: Boolean(
      isConnected &&
        hubConfig &&
        publicClient &&
        chainMatches &&
        !oracleUnset &&
        !configError,
    ),
  });

  const {
    data: perModelPrices = [],
    isFetching: perModelFetching,
  } = useQuery({
    queryKey: [
      "networkModelPrices",
      hubConfig?.chainId,
      hubConfig?.modelPriceOracleAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig) {
        throw new Error("Missing RPC client or hub config");
      }
      return listNetworkModels(
        publicClient,
        hubConfig.modelPriceOracleAddress,
      );
    },
    enabled: Boolean(
      isConnected &&
        hubConfig &&
        publicClient &&
        chainMatches &&
        !oracleUnset &&
        !configError,
    ),
  });

  const { data: teeMultiplierBps } = useQuery({
    queryKey: [
      "teePriceMultiplierBps",
      hubConfig?.chainId,
      hubConfig?.settlementEscrowAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig) {
        throw new Error("Missing RPC client or hub config");
      }
      return readTeePriceMultiplierBps(
        publicClient,
        hubConfig.settlementEscrowAddress,
      );
    },
    enabled: Boolean(
      isConnected &&
        hubConfig &&
        publicClient &&
        chainMatches &&
        hubConfig.settlementEscrowAddress.toLowerCase() !==
          ZERO_ADDRESS.toLowerCase() &&
        !configError,
    ),
  });

  const errMsg = useMemo(() => {
    if (!(defaultError instanceof Error)) {
      return "Could not load network model prices";
    }
    const m = defaultError.message;
    if (
      m.includes('returned no data ("0x")') ||
      m.includes("address is not a contract")
    ) {
      return `${m}\n\nNo contract at ${hubConfig?.modelPriceOracleAddress ?? "oracle"} on the chain RPC. Set NEXT_PUBLIC_MODEL_PRICE_ORACLE_ADDRESS_ASSHUB_DEV_STUB in .env.local from sparkl-solo/contracts/deployments/local.json (modelPriceOracle). If .env still defines this key, remove it there — only .env.local should set addresses.`;
    }
    return m;
  }, [defaultError, hubConfig?.modelPriceOracleAddress]);

  const defaultUnset =
    defaultPrice !== undefined &&
    (defaultPrice.updatedAt === 0n ||
      (defaultPrice.inputPer1kTokens === 0n &&
        defaultPrice.outputPer1kTokens === 0n));

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <VStack gap={1} alignItems="flex-start">
          <Text font="title2">Models</Text>
          <Text font="label2" color="fgMuted">
            Network reference pricing
          </Text>
          <Text font="body" color="fgMuted">
            MVP: a single reference rate applies to all models via
            ModelPriceOracle.defaultPrice. SettlementEscrow bills sessions from
            these rates (or per-model overrides when added post-MVP). TEE-verified
            sessions apply an on-chain multiplier at settle time.
          </Text>
          {teeMultiplierBps !== undefined ? (
            <Text font="caption" color="fgMuted">
              TEE billing multiplier: {(Number(teeMultiplierBps) / 10_000).toFixed(2)}×
              ({teeMultiplierBps.toString()} bps on SettlementEscrow)
            </Text>
          ) : null}
        </VStack>

        {!isConnected ? (
          <Banner variant="informational" showDismiss={false} bordered title="Connect wallet">
            Connect a wallet to read on-chain model prices.
          </Banner>
        ) : null}

        {configError ? (
          <Banner variant="error" showDismiss={false} bordered title="Configuration error">
            {configError}
          </Banner>
        ) : null}

        {isConnected && chainMatches && oracleUnset ? (
          <Banner variant="warning" showDismiss={false} bordered title="Oracle not configured">
            Set NEXT_PUBLIC_MODEL_PRICE_ORACLE_ADDRESS_* in .env.local from
            sparkl-solo/contracts/deployments/local.json after deploy.
          </Banner>
        ) : null}

        {defaultError ? (
          <Banner variant="error" showDismiss={false} bordered title="Load failed">
            {errMsg}
          </Banner>
        ) : null}

        {isConnected && chainMatches && !oracleUnset && !defaultError ? (
          <VStack gap={2} width="100%">
            {defaultFetching && !defaultPrice ? (
              <Text font="body" color="fgMuted">
                Loading…
              </Text>
            ) : null}

            {defaultPrice && !defaultUnset ? (
              <DataCard width="100%">
                <VStack gap={1} alignItems="flex-start">
                  <Text font="title4">Network default (all models)</Text>
                  <Text font="body" color="fgMuted">
                    Reference policy: {formatUsdPerM(MVP_DEFAULT_INPUT_PER_1M_USD)} input
                    / {formatUsdPerM(MVP_DEFAULT_OUTPUT_PER_1M_USD)} output per 1 million
                    tokens
                  </Text>
                  <Text font="body">
                    Input:{" "}
                    {formatModelPrice(defaultPrice.inputPer1kTokens, dotLabel)}
                  </Text>
                  <Text font="body">
                    Output:{" "}
                    {formatModelPrice(defaultPrice.outputPer1kTokens, dotLabel)}
                  </Text>
                  <Text font="caption" color="fgMuted">
                    Updated{" "}
                    {new Date(Number(defaultPrice.updatedAt) * 1000).toLocaleString()}
                  </Text>
                </VStack>
              </DataCard>
            ) : null}

            {defaultUnset && !defaultFetching ? (
              <Banner variant="warning" showDismiss={false} bordered title="Default not set">
                Start sparkl-oracle-model-price with MODEL_PRICE_SOURCES=flat to push
                defaultPrice (10¢ / 50¢ per 1M tokens).
              </Banner>
            ) : null}

            {perModelPrices.length > 0 ? (
              <VStack gap={1} alignItems="flex-start" width="100%">
                <Text font="label2" color="fgMuted">
                  Per-model overrides (post-MVP / dev)
                </Text>
                {perModelPrices.map((m) => (
                  <DataCard key={m.modelId} width="100%">
                    <VStack gap={1} alignItems="flex-start">
                      <HStack gap={2} alignItems="baseline">
                        <Text font="title4">
                          {m.name.startsWith("0x") && m.name.length === 66
                            ? `${m.name.slice(0, 14)}…`
                            : m.name}
                        </Text>
                        {m.name.startsWith("0x") && m.name.length === 66 ? (
                          <Text font="caption" color="fgMuted" mono>
                            {m.modelId}
                          </Text>
                        ) : null}
                      </HStack>
                      <Text font="body">
                        Input:{" "}
                        {formatModelPrice(m.price.inputPer1kTokens, dotLabel)}
                      </Text>
                      <Text font="body">
                        Output:{" "}
                        {formatModelPrice(m.price.outputPer1kTokens, dotLabel)}
                      </Text>
                      <Text font="caption" color="fgMuted">
                        Updated{" "}
                        {new Date(Number(m.price.updatedAt) * 1000).toLocaleString()}
                      </Text>
                    </VStack>
                  </DataCard>
                ))}
              </VStack>
            ) : perModelFetching ? null : (
              <Text font="caption" color="fgMuted">
                No per-model overrides on-chain. All sessions use the network default
                until individual model prices are published.
              </Text>
            )}
          </VStack>
        ) : null}
      </VStack>
    </Box>
  );
}
