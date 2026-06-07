import type { Connector } from "wagmi";

import {
  type EthereumProvider,
  getConnectedInjectedProvider,
} from "@/lib/evm/injectedProvider";

export type WalletRpcProbeResult =
  | { ok: true; chainId: number }
  | { ok: false; message: string };

function hasContractBytecode(code: unknown): boolean {
  return typeof code === "string" && code.length > 4 && code !== "0x" && code !== "0x0";
}

/**
 * Exercises the injected wallet’s saved chain RPC (SubWallet, MetaMask, etc.) — not the portal
 * `/api/rpc` proxy. Verifies chain id and that core contracts exist on the network the wallet uses.
 */
export async function probeInjectedWalletRpc(
  expectedChainId: number,
  opts?: {
    escrowAddress?: `0x${string}`;
    registryAddress?: `0x${string}`;
    expectedChainRpcUrl?: string;
    connector?: Connector;
    connectorName?: string;
  },
): Promise<WalletRpcProbeResult> {
  if (typeof window === "undefined") {
    return { ok: false, message: "Wallet probe must run in the browser." };
  }
  const eth = await getConnectedInjectedProvider(opts?.connector);
  if (!eth?.request) {
    return { ok: false, message: "No injected wallet provider for the connected account." };
  }
  const walletLabel = opts?.connectorName?.trim() || "connected wallet";

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

    const contractChecks: { label: string; address: `0x${string}` }[] = [];
    if (opts?.registryAddress) {
      contractChecks.push({ label: "OperatorRegistry", address: opts.registryAddress });
    }
    if (opts?.escrowAddress) {
      contractChecks.push({ label: "SettlementEscrow", address: opts.escrowAddress });
    }
    for (const { label, address } of contractChecks) {
      const code = await eth.request({
        method: "eth_getCode",
        params: [address, "latest"],
      });
      if (!hasContractBytecode(code)) {
        return {
          ok: false,
          message:
            `${walletLabel} RPC does not see ${label} at ${address} (eth_getCode empty). The portal reads Anvil via /api/rpc but ${walletLabel} is on a different endpoint.${rpcHint} In ${walletLabel}, set EVM chain ${expectedChainId} RPC to that URL only (not the portal /api/rpc). Toolbar → **Fix wallet RPC**. If you use SubWallet, disable MetaMask for this site so the probe uses SubWallet, not window.ethereum.`,
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
          message: `Wallet cannot complete gas RPC on its saved network (Failed to fetch).${rpcHint} Point the wallet network RPC at the chain node from .env, not the portal origin.`,
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
          `Wallet cannot reach its saved chain RPC (Failed to fetch).${rpcHint} If the portal simulates OK but signing hangs, the wallet is likely on a different RPC than Anvil. Re-add chain ${expectedChainId} with only the .env chain URL (http://127.0.0.1:8545).`,
      };
    }
    return { ok: false, message: msg };
  }
}
