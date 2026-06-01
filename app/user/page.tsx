"use client";

import { DataCard } from "@coinbase/cds-web/alpha/data-card";
import { Banner } from "@coinbase/cds-web/banner";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import NextLink from "next/link";
import { useMemo } from "react";
import { formatUnits, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useBytecode,
  useChainId,
  useReadContract,
} from "wagmi";

import { UserFundPanel } from "@/components/user/UserFundPanel";
import { settlementEscrowAbi } from "@/lib/abi";
import { ZERO_ADDRESS, chainRpcUrl, portalPublicRpcUrl } from "@/lib/chains";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

export default function UserHome() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { hubConfig, configError } = useHubChainConfig();

  const chainReady = Boolean(
    isConnected &&
      hubConfig &&
      chainId === hubConfig.chainId &&
      address,
  );

  const escrowUnset = useMemo(() => {
    if (!hubConfig?.settlementEscrowAddress) return true;
    return (
      hubConfig.settlementEscrowAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    );
  }, [hubConfig]);

  const { data: escrowBytecode } = useBytecode({
    address: hubConfig?.settlementEscrowAddress,
    query: {
      enabled: Boolean(chainReady && hubConfig && !escrowUnset),
    },
  });

  const escrowNotDeployed = useMemo(() => {
    if (!escrowBytecode) return false;
    return escrowBytecode === "0x" || escrowBytecode.length <= 2;
  }, [escrowBytecode]);

  const {
    data: balanceRaw,
    isFetching: balanceLoading,
  } = useReadContract({
    address: hubConfig?.settlementEscrowAddress,
    abi: settlementEscrowAbi,
    functionName: "getDotBalances",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(chainReady && hubConfig && address && !escrowUnset),
    },
  });

  const { data: nativeBalance, isFetched: nativeBalanceFetched } = useBalance({
    address,
    query: {
      enabled: Boolean(chainReady && address),
    },
  });

  const lowNativeForFees = useMemo(() => {
    if (
      !chainReady ||
      !hubConfig ||
      !nativeBalanceFetched ||
      !nativeBalance
    )
      return false;
    let minWei: bigint;
    try {
      minWei = parseUnits("0.001", hubConfig.nativeCurrency.decimals);
    } catch {
      minWei = parseUnits("0.001", 18);
    }
    return nativeBalance.value < minWei;
  }, [chainReady, hubConfig, nativeBalanceFetched, nativeBalance]);

  const balanceDisplay = useMemo(() => {
    if (
      !chainReady ||
      balanceRaw === undefined ||
      balanceRaw === null ||
      typeof balanceRaw !== "bigint"
    )
      return "—";
    return formatUnits(balanceRaw, 18);
  }, [balanceRaw, chainReady]);

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/" font="body" underline={false}>
          ← Home
        </Link>

        <div className="user-page-layout">
          <VStack gap={3} alignItems="stretch">
            <Text font="title2">User</Text>
            <Text font="body" color="fgMuted">
              Deposit or withdraw native DOT through SettlementEscrow (internal
              balance shown with 18 decimals per whole DOT). Connect your wallet
              using the toolbar. Manage inference sessions and API keys on{" "}
              <Link as={NextLink} href="/sessions" underline>
                My sessions
              </Link>
              .
            </Text>

            {hubConfig?.chainEnv === "assethub-dev-stub" && !configError ? (
              <Banner
                variant="informational"
                startIcon="wallet"
                showDismiss={false}
                title="Developer accounts (Anvil)"
              >
                <VStack gap={1}>
                  <Text font="caption" color="fgMuted">
                    Import Foundry Anvil’s default mnemonic (twelve words: “test
                    … test junk”) or a printed dev private key so your wallet holds
                    funded accounts on chain {hubConfig.chainId}.
                  </Text>
                  <Text font="caption" color="fgMuted">
                    MetaMask must use the chain RPC{" "}
                    <Text as="span" font="caption" mono tabularNumbers>
                      {chainRpcUrl(hubConfig)}
                    </Text>{" "}
                    (from{" "}
                    <Text as="span" font="caption" mono>
                      NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB
                    </Text>
                    ) — not the portal URL or{" "}
                    <Text as="span" font="caption" mono>
                      /api/rpc
                    </Text>
                    . Use <Text as="span" font="caption">Fix wallet RPC</Text> or{" "}
                    <Text as="span" font="caption">Switch network</Text> in the
                    toolbar. App reads/simulations use{" "}
                    <Text as="span" font="caption" mono tabularNumbers>
                      {typeof window !== "undefined"
                        ? portalPublicRpcUrl(
                            hubConfig,
                            window.location.origin,
                          )
                        : "…/api/rpc"}
                    </Text>{" "}
                    →{" "}
                    <Text as="span" font="caption" mono>
                      RPC_PROXY_TARGET
                    </Text>{" "}
                    on the dev machine (typically 127.0.0.1:8545).
                  </Text>
                  <Text font="caption" color="fgMuted">
                    Deploy with{" "}
                    <Text as="span" font="caption" mono>
                      sparkl-solo/contracts/script/DeployLocal.s.sol
                    </Text>{" "}
                    so SettlementEscrow uses 18‑decimal native (Anvil wei).
                    After Deposit, the Next terminal shows simulate/fill on{" "}
                    <Text as="span" font="caption" mono>
                      /api/rpc
                    </Text>
                    ; MetaMask submits to{" "}
                    <Text as="span" font="caption" mono>
                      :8545
                    </Text>{" "}
                    (not logged in [rpc-proxy]). Lines like{" "}
                    <Text as="span" font="caption" mono>
                      symbol()
                    </Text>{" "}
                    /{" "}
                    <Text as="span" font="caption" mono>
                      balanceOf
                    </Text>{" "}
                    reverting on the escrow address are MetaMask token sniffing,
                    not a failed deposit.
                  </Text>
                </VStack>
              </Banner>
            ) : null}

            {configError ? (
              <Banner
                variant="error"
                startIcon="warning"
                showDismiss={false}
                title="Configuration error"
              >
                <Text font="body">{configError}</Text>
              </Banner>
            ) : null}

            {hubConfig && escrowNotDeployed && !escrowUnset && !configError ? (
              <Banner
                variant="error"
                startIcon="warning"
                showDismiss={false}
                title="SettlementEscrow not deployed on this Anvil"
              >
                <VStack gap={1}>
                  <Text font="body">
                    No contract bytecode at{" "}
                    <Text font="body" mono tabularNumbers as="span">
                      {hubConfig.settlementEscrowAddress}
                    </Text>
                    . Restarting Anvil wiped the chain — redeploy and update
                    .env.local.
                  </Text>
                  <Text font="caption" color="fgMuted" mono>
                    cd sparkl-solo/contracts && forge script
                    script/DeployLocal.s.sol:DeployLocal --rpc-url
                    http://127.0.0.1:8545 --broadcast
                  </Text>
                </VStack>
              </Banner>
            ) : null}

            {hubConfig && escrowUnset && !configError ? (
              <Banner
                variant="error"
                startIcon="warning"
                showDismiss={false}
                title="Settlement escrow address missing"
              >
                <VStack gap={1}>
                  <Text font="body">
                    NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_ASSHUB_DEV_STUB points
                    at the zero address (placeholder only). Your wallet treated
                    the action as a plain send to{" "}
                    <Text font="body" mono tabularNumbers as="span">
                      0x000…000
                    </Text>
                    — no{" "}
                    <Text font="body" mono tabularNumbers as="span">
                      depositDot
                    </Text>{" "}
                    ran (note empty logs and ~21k gas).
                  </Text>
                  <Text font="caption" color="fgMuted">
                    Deploy SettlementEscrow from sparkl-solo, set the real escrow
                    address in .env, restart yarn dev, then deposit again.
                  </Text>
                </VStack>
              </Banner>
            ) : null}

            {!isConnected ? (
              <Banner
                variant="informational"
                startIcon="wallet"
                showDismiss={false}
                title="Wallet disconnected"
              >
                <Text font="body">
                  Connect a wallet from the toolbar to view your escrow balance
                  and submit transactions.
                </Text>
              </Banner>
            ) : null}

            {isConnected && hubConfig && chainId !== hubConfig.chainId ? (
              <Banner
                variant="warning"
                startIcon="warning"
                showDismiss={false}
                title="Wrong network"
              >
                <Text font="body">
                  Switch to chain {hubConfig.chainId} ({hubConfig.chainName}) to
                  fund escrow.
                </Text>
              </Banner>
            ) : null}

            {address ? (
              <HStack gap={1}>
                <Text font="caption" color="fgMuted">
                  Connected
                </Text>
                <Text font="caption" mono tabularNumbers>
                  {address}
                </Text>
              </HStack>
            ) : null}

            <DataCard
              layout="vertical"
              title={
                <Text font="label2" color="fgMuted">
                  Escrow balance (internal DOT units)
                </Text>
              }
              subtitle={
                <Text font="title3" mono tabularNumbers>
                  {balanceLoading ? "…" : balanceDisplay}
                </Text>
              }
            />

            {lowNativeForFees && hubConfig ? (
              <Banner
                variant="warning"
                startIcon="warning"
                showDismiss={false}
                title="Low wallet balance for fees"
              >
                <Text font="body">
                  Your account needs enough native{" "}
                  <Text as="span" font="body" mono>
                    {hubConfig.nativeCurrency.symbol}
                  </Text>{" "}
                  outside escrow to pay gas for deposits and withdrawals. Fund the
                  same address on chain, not only the escrow balance.
                </Text>
              </Banner>
            ) : null}
          </VStack>

          <div className="user-fund-panel-sticky">
            <UserFundPanel />
          </div>
        </div>
      </VStack>
    </Box>
  );
}
