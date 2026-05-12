import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";

import {
  getActiveChainConfig,
  hubChainFromConfig,
  walletFacingRpcUrl,
} from "@/lib/chains";

function useSameOriginRpcProxy(): boolean {
  const v = process.env.NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY;
  return v === "1" || v === "true";
}

export function getHubWagmiConfig() {
  const cfg = getActiveChainConfig();
  const chain = hubChainFromConfig(cfg);
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. Create a project at https://cloud.walletconnect.com/",
    );
  }

  const transportUrl = useSameOriginRpcProxy()
    ? walletFacingRpcUrl(cfg)
    : cfg.rpcUrl;

  if (useSameOriginRpcProxy() && !process.env.RPC_PROXY_TARGET?.trim()) {
    console.warn(
      "[wagmi] NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY is set but RPC_PROXY_TARGET is missing; /api/rpc may 501.",
    );
  }

  return getDefaultConfig({
    appName: "Sparkl Portal",
    projectId,
    chains: [chain],
    transports: {
      [chain.id]: http(transportUrl),
    },
    ssr: false,
  });
}
