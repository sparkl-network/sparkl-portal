"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http, type PublicClient } from "viem";

import { hubChainFromConfig, portalPublicRpcUrl } from "@/lib/chains";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

/**
 * Portal read/simulate/receipt client — uses `/api/rpc` when the same-origin proxy is on.
 * Do not use for wallet broadcasts; wagmi `useWalletClient` uses the chain RPC + injected provider.
 */
export function usePortalPublicClient(): PublicClient | undefined {
  const { hubConfig } = useHubChainConfig();
  const [origin, setOrigin] = useState<string | undefined>();

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return useMemo(() => {
    if (!hubConfig || !origin) return undefined;
    const chain = hubChainFromConfig(hubConfig, origin);
    return createPublicClient({
      chain,
      transport: http(portalPublicRpcUrl(hubConfig, origin), { timeout: 15_000 }),
    });
  }, [hubConfig, origin]);
}
