"use client";

import { Button } from "@coinbase/cds-web/buttons";
import { VStack } from "@coinbase/cds-web/layout";
import { Text } from "@coinbase/cds-web/typography";
import { useMemo } from "react";
import { formatUnits } from "viem";
import { useAccount, useChainId, useReadContract } from "wagmi";

import { settlementEscrowAbi } from "@/lib/abi";
import { ZERO_ADDRESS } from "@/lib/chains";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

type RkAccount = {
  address: string;
  displayBalance?: string;
  displayName: string;
};

const accountInfoTextStyle = {
  fontSize: "0.6875rem",
  lineHeight: "0.8125rem",
  textTransform: "none" as const,
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

  const { data: escrowRaw, isFetching: escrowLoading } = useReadContract({
    address: hubConfig?.settlementEscrowAddress,
    abi: settlementEscrowAbi,
    functionName: "getDotBalances",
    args: account?.address ? [account.address as `0x${string}`] : undefined,
    query: {
      enabled: Boolean(
        chainReady && hubConfig && account?.address && !escrowUnset,
      ),
    },
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
        accessibilityLabel="Connect wallet"
        compact
        variant="primary"
        onClick={openConnectModal}
      >
        Connect Wallet
      </Button>
    );
  }

  return (
    <Button
      accessibilityLabel="Open account options"
      compact
      variant="secondary"
      onClick={openAccountModal}
    >
      <VStack
        gap={0.25}
        style={{ alignItems: "flex-end", textAlign: "right" as const }}
      >
        <Text
          font="legal"
          color="fgMuted"
          mono
          noWrap
          style={accountInfoTextStyle}
        >
          {connectedAccount.displayName}
        </Text>
        <Text
          font="legal"
          color="fgMuted"
          tabularNumbers
          noWrap
          style={accountInfoTextStyle}
        >
          Wallet · {walletDisplay}
        </Text>
        <Text
          font="legal"
          color="fgMuted"
          tabularNumbers
          noWrap
          style={accountInfoTextStyle}
        >
          Escrow · {escrowDisplay}
        </Text>
      </VStack>
    </Button>
  );
}
