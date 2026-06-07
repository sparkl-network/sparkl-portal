"use client";

import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { formatUnits } from "viem";
import { useAccount, useChainId } from "wagmi";

import { settlementEscrowAbi } from "@/lib/abi";
import { ZERO_ADDRESS } from "@/lib/chains";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { usePortalPublicClient } from "@/lib/usePortalPublicClient";

type RkAccount = {
  address: string;
  displayBalance?: string;
  displayName: string;
};

export function ToolbarConnectAccount({
  mounted,
  account,
  openAccountModal,
  openConnectModal,
}: {
  mounted: boolean;
  account?: RkAccount;
  openAccountModal: () => void;
  openConnectModal: () => void;
}) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { hubConfig } = useHubChainConfig();

  const chainReady = Boolean(
    isConnected &&
      hubConfig &&
      chainId === hubConfig.chainId &&
      account?.address,
  );

  const escrowUnset = useMemo(() => {
    if (!hubConfig?.settlementEscrowAddress) return true;
    return (
      hubConfig.settlementEscrowAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    );
  }, [hubConfig]);

  const publicClient = usePortalPublicClient();
  const { data: escrowRaw, isFetching: escrowLoading } = useQuery({
    queryKey: [
      "toolbarEscrowBalance",
      hubConfig?.chainId,
      hubConfig?.settlementEscrowAddress,
      account?.address,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig?.settlementEscrowAddress || !account?.address) {
        return undefined;
      }
      return publicClient.readContract({
        address: hubConfig.settlementEscrowAddress,
        abi: settlementEscrowAbi,
        functionName: "getDotBalances",
        args: [account.address as `0x${string}`],
      });
    },
    enabled: Boolean(chainReady && publicClient && hubConfig && account?.address && !escrowUnset),
    refetchInterval: 12_000,
  });

  const nativeSymbol = hubConfig?.nativeCurrency.symbol ?? "DOT";

  const escrowDisplay = useMemo(() => {
    if (!chainReady || escrowUnset) return "—";
    if (escrowLoading && escrowRaw === undefined) return "…";
    if (
      escrowRaw === undefined ||
      escrowRaw === null ||
      typeof escrowRaw !== "bigint"
    )
      return "—";
    return `${formatUnits(escrowRaw, 18)} ${nativeSymbol}`;
  }, [chainReady, escrowUnset, escrowLoading, escrowRaw, nativeSymbol]);

  const walletDisplay = account?.displayBalance
    ? account.displayBalance
    : "…";

  if (!mounted) return null;

  const showConnected = Boolean(isConnected && account?.address);
  const connectedAccount = showConnected ? account : undefined;

  if (!showConnected || !connectedAccount) {
    return (
      <Button
        size="compact"
        onClick={openConnectModal}
      >
        Connect Wallet
      </Button>
    );
  }

  return (
    <Button
      variant="secondary"
      size="compact"
      onClick={openAccountModal}
    >
      <div className="flex flex-col items-end gap-0 text-right">
        <span className="text-[10px] leading-[12px] tabular-nums font-mono text-muted-foreground truncate max-w-[160px]">
          {connectedAccount.displayName}
        </span>
        <span className="text-[10px] leading-[12px] tabular-nums text-muted-foreground truncate max-w-[160px]">
          Wallet · {walletDisplay}
        </span>
        <span className="text-[10px] leading-[12px] tabular-nums text-muted-foreground truncate max-w-[160px]">
          Escrow · {escrowDisplay}
        </span>
      </div>
    </Button>
  );
}
