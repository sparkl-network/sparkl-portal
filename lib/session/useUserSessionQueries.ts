"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAccount, useChainId } from "wagmi";

import { settlementEscrowAbi } from "@/lib/abi";
import { ZERO_ADDRESS } from "@/lib/chains";
import { getSession, getSessionIdsForUser } from "@/lib/evm/escrow";
import { listNetworkModels } from "@/lib/evm/modelOracle";
import { lookupRouterStatus, useRouterNodesStatus } from "@/lib/router/useRouterData";
import { routerBaseUrl } from "@/lib/router/activate";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { usePortalPublicClient } from "@/lib/usePortalPublicClient";

export function useUserSessionQueries() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePortalPublicClient();
  const { hubConfig, configError } = useHubChainConfig();

  const chainReady = Boolean(
    isConnected && hubConfig && chainId === hubConfig.chainId && address && publicClient,
  );

  const escrowUnset = useMemo(() => {
    if (!hubConfig?.settlementEscrowAddress) return true;
    return hubConfig.settlementEscrowAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  }, [hubConfig]);

  const routerConfigured = Boolean(routerBaseUrl());
  const { statusByNodeId, unavailable: routerStatusUnavailable } = useRouterNodesStatus();

  const { data: dotBalance = 0n } = useQuery({
    queryKey: [
      "sessionsEscrowBalance",
      hubConfig?.chainId,
      hubConfig?.settlementEscrowAddress,
      address,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig?.settlementEscrowAddress || !address) return 0n;
      const raw = await publicClient.readContract({
        address: hubConfig.settlementEscrowAddress,
        abi: settlementEscrowAbi,
        functionName: "getDotBalances",
        args: [address],
      });
      return raw as bigint;
    },
    enabled: Boolean(chainReady && publicClient && hubConfig && address && !escrowUnset),
  });

  const {
    data: sessions = [],
    error,
    isFetching,
  } = useQuery({
    queryKey: ["userSessions", hubConfig?.chainId, hubConfig?.settlementEscrowAddress, address],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !address) throw new Error("Missing client, config, or wallet");
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
      if (!publicClient || !hubConfig?.modelPriceOracleAddress) return new Map<string, string>();
      const models = await listNetworkModels(publicClient, hubConfig.modelPriceOracleAddress);
      return new Map(models.map((m) => [m.modelId.toLowerCase(), m.name]));
    },
    enabled: Boolean(chainReady && hubConfig?.modelPriceOracleAddress && !escrowUnset),
  });

  return {
    address,
    isConnected,
    chainId,
    publicClient,
    hubConfig,
    configError,
    chainReady,
    escrowUnset,
    routerConfigured,
    statusByNodeId,
    routerStatusUnavailable,
    dotBalance,
    sessions,
    error,
    isFetching,
    modelNameById,
    lookupRouterStatus,
  };
}
