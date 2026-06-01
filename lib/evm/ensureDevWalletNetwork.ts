import {
  type HubChainConfig,
  chainRpcUrl,
  isPublicHttpsChainRpc,
} from "@/lib/chains";
import { isHttpLanPageRpc, walletAddEthereumChainRpcUrl } from "@/lib/evm/metamaskRpcUrl";

type EthereumProvider = {
  request: (args: {
    method: string;
    params?: unknown[];
  }) => Promise<unknown>;
};

/**
 * Register/switch MetaMask to the hub chain using the **chain node RPC** (`NEXT_PUBLIC_RPC_URL_*`),
 * not the portal `/api/rpc` proxy. Wallets must talk to the chain directly.
 */
export async function ensureDevWalletNetwork(
  hubConfig: HubChainConfig,
): Promise<string | undefined> {
  if (typeof window === "undefined") {
    throw new Error("Wallet network setup must run in the browser");
  }
  const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!eth?.request) {
    throw new Error("No injected wallet (e.g. MetaMask) found");
  }

  const chainRpc = chainRpcUrl(hubConfig);
  const { addUrl: rpcForAdd } = walletAddEthereumChainRpcUrl(chainRpc);
  const chainIdHex = `0x${hubConfig.chainId.toString(16)}` as `0x${string}`;

  try {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: hubConfig.chainName,
          rpcUrls: [rpcForAdd],
          nativeCurrency: {
            name: hubConfig.nativeCurrency.name,
            symbol: hubConfig.nativeCurrency.symbol,
            decimals: hubConfig.nativeCurrency.decimals,
          },
        },
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (
      lower.includes("https url") &&
      lower.includes("rpcurls") &&
      isHttpLanPageRpc(chainRpc)
    ) {
      throw new Error(
        `MetaMask rejected HTTP LAN chain RPC (${chainRpc}). Add chain ${hubConfig.chainId} manually in MetaMask → Settings → Networks with that RPC URL (manual entry allows HTTP).`,
      );
    }
    if (lower.includes("already") || msg.includes("4902")) {
      throw new Error(
        `Network ${hubConfig.chainId} already exists. In MetaMask → Select RPC URL, choose ${chainRpc} (chain node, not the portal /api/rpc). Remove duplicate 31337 entries.`,
      );
    }
    throw e;
  }

  await eth.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: chainIdHex }],
  });

  if (isPublicHttpsChainRpc(chainRpc)) {
    return `MetaMask network updated. Select RPC URL must be only ${chainRpc} — remove :8545, localhost, and any portal /api/rpc entries.`;
  }
  if (isHttpLanPageRpc(chainRpc)) {
    return `MetaMask should use chain RPC ${chainRpc} for sends. Do not use the portal /api/rpc URL in MetaMask.`;
  }
  return undefined;
}
