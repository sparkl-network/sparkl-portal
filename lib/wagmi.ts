import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http } from "wagmi";

import {
  getActiveChainConfig,
  getActiveChainEnv,
  hubChainFromConfig,
  portalPublicRpcUrl,
  portalRpcProxyEnabled,
} from "@/lib/chains";

/** @param pageOrigin Client-only: `window.location.origin` for portal `/api/rpc` transport when proxied. */
export function getHubWagmiConfig(pageOrigin?: string) {
  const cfg = getActiveChainConfig();
  const chain = hubChainFromConfig(cfg, pageOrigin);
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. Create a project at https://cloud.walletconnect.com/",
    );
  }

  const transportUrl = portalRpcProxyEnabled(cfg)
    ? portalPublicRpcUrl(cfg, pageOrigin)
    : cfg.rpcUrl;

  const devStub = getActiveChainEnv() === "assethub-dev-stub";
  const wallets = devStub
    ? [injectedWallet, metaMaskWallet]
    : [
        injectedWallet,
        metaMaskWallet,
        rainbowWallet,
        coinbaseWallet,
        walletConnectWallet,
      ];

  return getDefaultConfig({
    appName: "Sparkl Portal",
    projectId,
    chains: [chain],
    wallets: [
      {
        groupName: "Popular",
        wallets,
      },
    ],
    transports: {
      [chain.id]: http(transportUrl, { timeout: 15_000 }),
    },
    ssr: false,
  });
}
