"use client";

import NextLink from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { parseUnits } from "viem";
import { useAccount, useChainId } from "wagmi";

import { UserActiveSessionsPanel } from "@/components/user/UserActiveSessionsPanel";
import { UserFundPanel } from "@/components/user/UserFundPanel";
import { ZERO_ADDRESS, chainRpcUrl, portalPublicRpcUrl } from "@/lib/chains";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { usePortalPublicClient } from "@/lib/usePortalPublicClient";

export default function UserHome() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { hubConfig, configError } = useHubChainConfig();

  const publicClient = usePortalPublicClient();
  const chainReady = Boolean(isConnected && hubConfig && chainId === hubConfig.chainId && address);
  const escrowUnset = useMemo(() => {
    if (!hubConfig?.settlementEscrowAddress) return true;
    return hubConfig.settlementEscrowAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  }, [hubConfig]);

  const { data: escrowBytecode } = useQuery({
    queryKey: ["userEscrowBytecode", hubConfig?.chainId, hubConfig?.settlementEscrowAddress],
    queryFn: async () => {
      if (!publicClient || !hubConfig?.settlementEscrowAddress) return undefined;
      return publicClient.getBytecode({ address: hubConfig.settlementEscrowAddress });
    },
    enabled: Boolean(chainReady && publicClient && hubConfig && !escrowUnset),
  });

  const escrowNotDeployed = useMemo(() => {
    if (!escrowBytecode) return false;
    return escrowBytecode === "0x" || escrowBytecode.length <= 2;
  }, [escrowBytecode]);

  const { data: nativeBalance, isFetched: nativeBalanceFetched } = useQuery({
    queryKey: ["userPageNativeBalance", hubConfig?.chainId, address],
    queryFn: async () => {
      if (!publicClient || !address) return undefined;
      return publicClient.getBalance({ address });
    },
    enabled: Boolean(chainReady && publicClient && address),
  });

  const lowNativeForFees = useMemo(() => {
    if (!chainReady || !hubConfig || !nativeBalanceFetched || nativeBalance === undefined) return false;
    let minWei: bigint;
    try {
      minWei = parseUnits("0.001", hubConfig.nativeCurrency.decimals);
    } catch {
      minWei = parseUnits("0.001", 18);
    }
    return nativeBalance < minWei;
  }, [chainReady, hubConfig, nativeBalanceFetched, nativeBalance]);

  return (
    <div className="px-3 py-3 w-full space-y-4">
      <NextLink href="/" className="text-sm text-muted-foreground hover:underline inline-block">
        ← Home
      </NextLink>

      <h1 className="text-2xl font-bold">User</h1>

      {hubConfig?.chainEnv === "assethub-dev-stub" && !configError && (
        <div className="rounded-lg border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/40 p-3 text-xs space-y-1">
          <p>
            Import Foundry Anvil&apos;s default mnemonic (twelve words: &quot;test … test junk&quot;) or a
            printed dev private key so your wallet holds funded accounts on chain {hubConfig.chainId}.
          </p>
          <p>
            MetaMask must use the chain RPC{" "}
            <code className="bg-muted px-1 py-0.5 rounded">{chainRpcUrl(hubConfig)}</code> (from{" "}
            <code>NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB</code>) — not the portal URL or /api/rpc. Use Fix
            wallet RPC or Switch network in the toolbar. App reads/simulations use{" "}
            <code>
              {typeof window !== "undefined"
                ? portalPublicRpcUrl(hubConfig, window.location.origin)
                : "…/api/rpc"}
            </code>{" "}
            → <code>RPC_PROXY_TARGET</code> on the dev machine (typically 127.0.0.1:8545).
          </p>
          <p>
            Deploy with{" "}
            <code className="bg-muted px-1 py-0.5 rounded">
              sparkl-solo/contracts/script/DeployLocal.s.sol
            </code>{" "}
            so SettlementEscrow uses 18-decimal native (Anvil wei). After Deposit, the Next terminal
            shows simulate/fill on /api/rpc; MetaMask submits to :8545 (not logged in [rpc-proxy]).
            Lines like <code>symbol()</code>/<code>balanceOf</code> reverting on the escrow address are
            MetaMask token sniffing, not a failed deposit.
          </p>
        </div>
      )}

      {configError && (
        <div className="rounded-lg border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm">
          <strong>Configuration error:</strong> {configError}
        </div>
      )}

      {hubConfig && escrowNotDeployed && !escrowUnset && !configError && (
        <div className="rounded-lg border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 space-y-1">
          <p>
            <strong>SettlementEscrow not deployed on this Anvil</strong>
          </p>
          <p>
            No contract bytecode at{" "}
            <code className="bg-muted px-1 py-0.5 rounded">{hubConfig.settlementEscrowAddress}</code>.
            Restarting Anvil wiped the chain — redeploy and update .env.local.
          </p>
          <pre className="text-xs bg-muted p-2 rounded mt-1">
            cd sparkl-solo/contracts && forge script script/DeployLocal.s.sol:DeployLocal --rpc-url
            http://127.0.0.1:8545 --broadcast
          </pre>
        </div>
      )}

      {hubConfig && escrowUnset && !configError && (
        <div className="rounded-lg border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 space-y-1">
          <p>
            <strong>Settlement escrow address missing</strong>
          </p>
          <p>
            NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_ASSHUB_DEV_STUB points at the zero address
            (placeholder only). Your wallet treated the action as a plain send to 0x000…000 — no
            depositDot ran (note empty logs and ~21k gas).
          </p>
          <pre className="text-xs">
            Deploy SettlementEscrow from sparkl-solo, set the real escrow address in .env, restart yarn
            dev, then deposit again.
          </pre>
        </div>
      )}

      {!isConnected && (
        <div className="rounded-lg border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/40 p-3 text-sm">
          Connect a wallet from the toolbar to view your escrow balance and submit transactions.
        </div>
      )}

      {isConnected && hubConfig && chainId !== hubConfig.chainId && (
        <div className="rounded-lg border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/40 p-3 text-sm">
          Switch to chain {hubConfig.chainId} ({hubConfig.chainName}) to fund escrow.
        </div>
      )}

      {address && <code className="break-all text-xs font-mono block">{address}</code>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem] gap-6 items-start">
        <div className="min-w-0">
          <UserActiveSessionsPanel />
        </div>
        <div className="w-full lg:w-96 shrink-0">
          <UserFundPanel />
        </div>
      </div>

      {lowNativeForFees && hubConfig && (
        <div className="rounded-lg border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/40 p-3 text-sm">
          Your account needs enough native <code>{hubConfig.nativeCurrency.symbol}</code> outside escrow
          to pay gas for deposits and withdrawals. Fund the same address on chain, not only the escrow
          balance.
        </div>
      )}
    </div>
  );
}
