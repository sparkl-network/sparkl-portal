import type { Address, Hex } from "viem";
import type { Connector } from "wagmi";

import {
  type EthereumProvider,
  getConnectedInjectedProvider,
} from "@/lib/evm/injectedProvider";

function toQuantity(value: bigint): Hex {
  return `0x${value.toString(16)}` as Hex;
}

/**
 * Minimal `eth_sendTransaction` via `window.ethereum` (hex quantities only).
 * Used when viem's wallet transport surfaces MetaMask internal JSON-RPC errors.
 */
export async function sendViaInjectedProvider(
  tx: {
    from: Address;
    to: Address;
    data: Hex;
    value?: bigint;
    gas?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    gasPrice?: bigint;
  },
  connector?: Connector,
): Promise<Hex> {
  if (typeof window === "undefined") {
    throw new Error("Injected provider send must run in the browser");
  }
  const eth = await getConnectedInjectedProvider(connector);
  if (!eth?.request) {
    throw new Error("No injected provider for the connected wallet");
  }

  const param: Record<string, string> = {
    from: tx.from,
    to: tx.to,
    data: tx.data,
    value: toQuantity(tx.value ?? 0n),
  };
  if (tx.gas != null) param.gas = toQuantity(tx.gas);
  if (tx.maxFeePerGas != null && tx.maxPriorityFeePerGas != null) {
    param.maxFeePerGas = toQuantity(tx.maxFeePerGas);
    param.maxPriorityFeePerGas = toQuantity(tx.maxPriorityFeePerGas);
  } else if (tx.gasPrice != null) {
    param.gasPrice = toQuantity(tx.gasPrice);
  }

  const hash = (await eth.request({
    method: "eth_sendTransaction",
    params: [param],
  })) as string;

  if (typeof hash !== "string" || !hash.startsWith("0x")) {
    throw new Error(`Wallet returned unexpected tx hash: ${String(hash)}`);
  }
  return hash as Hex;
}
