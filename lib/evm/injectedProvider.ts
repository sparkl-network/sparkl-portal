import type { Connector } from "wagmi";

export type EthereumProvider = {
  request: (args: {
    method: string;
    params?: unknown[];
  }) => Promise<unknown>;
};

/**
 * RPC probes and wallet_addEthereumChain must use the **connected** connector’s provider.
 * `window.ethereum` may be MetaMask (or another extension) while RainbowKit connected SubWallet.
 */
export async function getConnectedInjectedProvider(
  connector: Connector | undefined,
): Promise<EthereumProvider | undefined> {
  if (connector) {
    try {
      const provider = await connector.getProvider();
      if (
        provider &&
        typeof provider === "object" &&
        "request" in provider &&
        typeof (provider as EthereumProvider).request === "function"
      ) {
        return provider as EthereumProvider;
      }
    } catch {
      /* fall through */
    }
  }
  if (typeof window === "undefined") return undefined;
  const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  return eth?.request ? eth : undefined;
}
