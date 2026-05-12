import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";

import { getActiveChainConfig, hubChainFromConfig } from "@/lib/chains";

export function getHubWagmiConfig() {
  const cfg = getActiveChainConfig();
  const chain = hubChainFromConfig(cfg);
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "Missing NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. Create a project at https://cloud.walletconnect.com/",
    );
  }

  return getDefaultConfig({
    appName: "Sparkl Portal",
    projectId,
    chains: [chain],
    transports: {
      [chain.id]: http(cfg.rpcUrl),
    },
    ssr: true,
  });
}
