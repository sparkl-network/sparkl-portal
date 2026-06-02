"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";

import { ZERO_ADDRESS } from "@/lib/chains";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MVP_DEFAULT_INPUT_PER_1M_USD,
  MVP_DEFAULT_OUTPUT_PER_1M_USD,
  listNetworkModels,
  readDefaultModelPrice,
} from "@/lib/evm/modelOracle";
import { readTeePriceMultiplierBps } from "@/lib/evm/escrow";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { useAccount, useChainId, usePublicClient } from "wagmi";

const INTERNAL_DOT_DECIMALS = 18;

function formatModelPrice(wei: bigint, symbol: string): string {
  try { return `${formatUnits(wei, INTERNAL_DOT_DECIMALS)} ${symbol} / 1k`; } catch { return "—"; }
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
    !hubConfig || !hubConfig.modelPriceOracleAddress || hubConfig.modelPriceOracleAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase(),
  );

  const dotLabel = hubConfig?.nativeCurrency.symbol ?? "DOT";

  const { data: defaultPrice, error: defaultError, isFetching: defaultFetching } = useQuery({
    queryKey: ["defaultModelPrice", hubConfig?.chainId, hubConfig?.modelPriceOracleAddress],
    queryFn: async () => {
      if (!publicClient || !hubConfig) throw new Error("Missing RPC client or hub config");
      return readDefaultModelPrice(publicClient, hubConfig.modelPriceOracleAddress);
    },
    enabled: Boolean(isConnected && hubConfig && publicClient && chainMatches && !oracleUnset && !configError),
  });

  const { data: perModelPrices = [], isFetching: perModelFetching } = useQuery({
    queryKey: ["networkModelPrices", hubConfig?.chainId, hubConfig?.modelPriceOracleAddress],
    queryFn: async () => {
      if (!publicClient || !hubConfig) throw new Error("Missing RPC client or hub config");
      return listNetworkModels(publicClient, hubConfig.modelPriceOracleAddress);
    },
    enabled: Boolean(isConnected && hubConfig && publicClient && chainMatches && !oracleUnset && !configError),
  });

  const { data: teeMultiplierBps } = useQuery({
    queryKey: ["teePriceMultiplierBps", hubConfig?.chainId, hubConfig?.settlementEscrowAddress],
    queryFn: async () => {
      if (!publicClient || !hubConfig) throw new Error("Missing RPC client or hub config");
      return readTeePriceMultiplierBps(publicClient, hubConfig.settlementEscrowAddress);
    },
    enabled: Boolean(
      isConnected && hubConfig && publicClient && chainMatches &&
      hubConfig.settlementEscrowAddress.toLowerCase() !== ZERO_ADDRESS.toLowerCase() && !configError,
    ),
  });

  const errMsg = useMemo(() => {
    if (!(defaultError instanceof Error)) return "Could not load network model prices";
    const m = defaultError.message;
    if (m.includes('returned no data ("0x")') || m.includes("address is not a contract")) {
      return `${m}\n\nNo contract at ${hubConfig?.modelPriceOracleAddress ?? "oracle"} on the chain RPC. Set NEXT_PUBLIC_MODEL_PRICE_ORACLE_ADDRESS_ASSHUB_DEV_STUB in .env.local from sparkl-solo/contracts/deployments/local.json (modelPriceOracle). If .env still defines this key, remove it there — only .env.local should set addresses.`;
    }
    return m;
  }, [defaultError, hubConfig?.modelPriceOracleAddress]);

  const defaultUnset = defaultPrice !== undefined && (
    defaultPrice.updatedAt === 0n || (defaultPrice.inputPer1kTokens === 0n && defaultPrice.outputPer1kTokens === 0n)
  );

  return (
    <div className="px-3 py-3 w-full space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">Models</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">Network reference pricing</p>
        <p className="text-sm text-muted-foreground/80 mt-2 leading-relaxed max-w-3xl">
          MVP: a single reference rate applies to all models via ModelPriceOracle.defaultPrice. SettlementEscrow bills sessions from these rates (or per-model overrides when added post-MVP). TEE-verified sessions apply an on-chain multiplier at settle time.
        </p>
        {teeMultiplierBps !== undefined && (
          <Badge variant="secondary" className="mt-2 text-xs">
            TEE billing multiplier: {(Number(teeMultiplierBps) / 10_000).toFixed(2)}× ({teeMultiplierBps.toString()} bps on SettlementEscrow)
          </Badge>
        )}
      </div>

      {/* Error banners */}
      {!isConnected && (
        <Alert variant="informational" className="mb-4">
          <AlertTitle>Connect wallet</AlertTitle>
          <AlertDescription>Connect a wallet to read on-chain model prices.</AlertDescription>
        </Alert>
      )}

      {configError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Configuration error</AlertTitle>
          <AlertDescription>{configError}</AlertDescription>
        </Alert>
      )}

      {isConnected && chainMatches && oracleUnset && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>Oracle not configured</AlertTitle>
          <AlertDescription>Set NEXT_PUBLIC_MODEL_PRICE_ORACLE_ADDRESS_* in .env.local from sparkl-solo/contracts/deployments/local.json after deploy.</AlertDescription>
        </Alert>
      )}

      {defaultError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Load failed</AlertTitle>
          <AlertDescription>{errMsg}</AlertDescription>
        </Alert>
      )}

      {/* Content */}
      {isConnected && chainMatches && !oracleUnset && !defaultError ? (
        <div className="space-y-4">
          {defaultFetching && !defaultPrice ? (
            <Skeleton className="h-[120px] w-full" />
          ) : null}

          {defaultPrice && !defaultUnset && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Network default (all models)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">Reference policy: {formatUsdPerM(MVP_DEFAULT_INPUT_PER_1M_USD)} input / {formatUsdPerM(MVP_DEFAULT_OUTPUT_PER_1M_USD)} output per 1 million tokens</p>
                <div className="flex gap-6 flex-wrap text-sm">
                  <div>Input: <span className="font-mono">{formatModelPrice(defaultPrice.inputPer1kTokens, dotLabel)}</span></div>
                  <div>Output: <span className="font-mono">{formatModelPrice(defaultPrice.outputPer1kTokens, dotLabel)}</span></div>
                </div>
                <p className="text-xs text-muted-foreground">Updated {new Date(Number(defaultPrice.updatedAt) * 1000).toLocaleString()}</p>
              </CardContent>
            </Card>
          )}

          {defaultUnset && !defaultFetching && (
            <Alert variant="warning" className="mb-4">
              <AlertTitle>Default not set</AlertTitle>
              <AlertDescription>Start sparkl-oracle-model-price with MODEL_PRICE_SOURCES=flat to push defaultPrice (10¢ / 50¢ per 1M tokens).</AlertDescription>
            </Alert>
          )}

          {/* Per-model overrides */}
          {perModelPrices.length > 0 ? (
            <>
              <div className="flex items-center gap-2 pt-4 border-t">
                <h3 className="text-sm font-medium text-muted-foreground">Per-model overrides (post-MVP / dev)</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {perModelPrices.map((m) => (
                  <Card key={m.modelId}>
                    <CardHeader className="pb-2">
                      <div className="flex items-baseline gap-2">
                        <CardTitle className="text-base">
                          {m.name.startsWith("0x") && m.name.length === 66 ? `${m.name.slice(0, 14)}…` : m.name}
                        </CardTitle>
                        {m.name.startsWith("0x") && m.name.length === 66 && (
                          <code className="text-xs font-mono text-muted-foreground">{m.modelId}</code>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      <p className="text-sm">Input: <span className="font-mono">{formatModelPrice(m.price.inputPer1kTokens, dotLabel)}</span></p>
                      <p className="text-sm">Output: <span className="font-mono">{formatModelPrice(m.price.outputPer1kTokens, dotLabel)}</span></p>
                      <p className="text-xs text-muted-foreground">Updated {new Date(Number(m.price.updatedAt) * 1000).toLocaleString()}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : perModelFetching ? (
            <Skeleton className="h-[80px] w-full" />
          ) : (
            <p className="text-xs text-muted-foreground pt-4">No per-model overrides on-chain. All sessions use the network default until individual model prices are published.</p>
          )}
        </div>
      ) : null}

      {!isConnected && !configError && oracleUnset ? (
        <Skeleton className="h-[200px] w-full" />
      ) : null}
    </div>
  );
}
