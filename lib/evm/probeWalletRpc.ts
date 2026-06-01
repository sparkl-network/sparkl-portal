type EthereumProvider = {
  request: (args: {
    method: string;
    params?: unknown[];
  }) => Promise<unknown>;
};

export type WalletRpcProbeResult =
  | { ok: true; chainId: number }
  | { ok: false; message: string };

function hasContractBytecode(code: unknown): boolean {
  return typeof code === "string" && code.length > 4 && code !== "0x" && code !== "0x0";
}

/**
 * Exercises MetaMask’s saved chain RPC (not the portal). Verifies chain id and that the
 * escrow contract is deployed on the network the wallet actually talks to.
 */
export async function probeInjectedWalletRpc(
  expectedChainId: number,
  opts?: {
    escrowAddress?: `0x${string}`;
    expectedChainRpcUrl?: string;
  },
): Promise<WalletRpcProbeResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: "Wallet probe must run in the browser." };
  }
  const eth = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!eth?.request) {
    return { ok: false, message: "No injected wallet (e.g. MetaMask) found." };
  }

  const rpcHint = opts?.expectedChainRpcUrl
    ? ` Required chain RPC: ${opts.expectedChainRpcUrl}`
    : "";

  try {
    const chainIdHex = (await eth.request({
      method: "eth_chainId",
      params: [],
    })) as string;
    const chainId = Number.parseInt(chainIdHex, 16);
    if (!Number.isFinite(chainId)) {
      return {
        ok: false,
        message: `Wallet returned invalid eth_chainId: ${String(chainIdHex)}`,
      };
    }
    if (chainId !== expectedChainId) {
      return {
        ok: false,
        message: `Wallet is on chain ${chainId}; switch to ${expectedChainId}.${rpcHint}`,
      };
    }

    await eth.request({ method: "eth_blockNumber", params: [] });

    if (opts?.escrowAddress) {
      const code = await eth.request({
        method: "eth_getCode",
        params: [opts.escrowAddress, "latest"],
      });
      if (!hasContractBytecode(code)) {
        return {
          ok: false,
          message:
            `MetaMask’s RPC does not see SettlementEscrow at ${opts.escrowAddress} (eth_getCode empty). The portal may be reading a different node than your wallet.${rpcHint} Delete every custom network for chain ${expectedChainId}, then use toolbar **Fix wallet RPC** so only that URL remains in Select RPC URL — not :8545, not localhost, not /api/rpc.`,
        };
      }
    }

    try {
      await eth.request({ method: "eth_gasPrice", params: [] });
    } catch (gasErr) {
      const msg = gasErr instanceof Error ? gasErr.message : String(gasErr);
      if (msg.toLowerCase().includes("fetch")) {
        return {
          ok: false,
          message: `MetaMask cannot complete gas RPC on its saved network (Failed to fetch).${rpcHint} Remove extra RPC URLs in Select RPC URL and keep a single entry matching .env.`,
        };
      }
    }

    return { ok: true, chainId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (
      lower.includes("failed to fetch") ||
      lower.includes("fetch failed") ||
      lower.includes("networkerror")
    ) {
      return {
        ok: false,
        message:
          `MetaMask cannot reach its saved chain RPC (Failed to fetch).${rpcHint} If the portal can simulate (eth_fillTransaction) but MetaMask fails on confirm, your wallet still has a stale RPC (e.g. :8545 or portal /api/rpc). Delete all chain ${expectedChainId} networks and re-add with only the .env chain URL.`,
      };
    }
    return { ok: false, message: msg };
  }
}
