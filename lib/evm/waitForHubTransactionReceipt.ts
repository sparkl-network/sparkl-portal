import type { Hash, PublicClient } from "viem";
import { waitForTransactionReceipt } from "viem/actions";

import { chainRpcUrl, type HubChainConfig } from "@/lib/chains";

const TX_VISIBILITY_POLL_MS = 2_000;
const TX_VISIBILITY_MAX_MS = 20_000;

/**
 * Wait for a receipt on the portal `publicClient` (/api/rpc → Anvil). If the wallet broadcast
 * to a different RPC (common with SubWallet custom networks), the tx hash never appears and
 * viem would otherwise poll until timeout with no wallet-side error.
 */
export async function waitForHubTransactionReceipt(
  publicClient: PublicClient,
  hubConfig: HubChainConfig,
  hash: Hash,
  timeoutMs: number,
): Promise<Awaited<ReturnType<typeof waitForTransactionReceipt>>> {
  const chainRpc = chainRpcUrl(hubConfig);
  const started = Date.now();
  const visibilityDeadline = started + Math.min(TX_VISIBILITY_MAX_MS, timeoutMs);

  while (Date.now() < visibilityDeadline) {
    const tx = await publicClient.getTransaction({ hash }).catch(() => null);
    if (tx) {
      const elapsed = Date.now() - started;
      return waitForTransactionReceipt(publicClient, {
        hash,
        timeout: Math.max(5_000, timeoutMs - elapsed),
      });
    }
    await new Promise((r) => setTimeout(r, TX_VISIBILITY_POLL_MS));
  }

  throw new Error(
    `Transaction ${hash} was returned by your wallet but is not visible on the portal RPC within ${TX_VISIBILITY_MAX_MS / 1000}s. ` +
      `SubWallet/MetaMask is probably broadcasting to a different endpoint than ${chainRpc}. ` +
      `Set the wallet network RPC for chain ${hubConfig.chainId} to that URL (not ${typeof window !== "undefined" ? `${window.location.origin}/api/rpc` : "the portal /api/rpc"}). ` +
      `Toolbar → Fix wallet RPC, then register again.`,
  );
}
