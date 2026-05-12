"use client";

import { DataCard } from "@coinbase/cds-web/alpha/data-card";
import { Banner } from "@coinbase/cds-web/banner";
import { Button } from "@coinbase/cds-web/buttons";
import { TextInput } from "@coinbase/cds-web/controls";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import NextLink from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useWalletClient,
} from "wagmi";

import { settlementEscrowAbi } from "@/lib/abi";
import { ZERO_ADDRESS } from "@/lib/chains";
import { depositDot, withdrawDot } from "@/lib/evm/escrow";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

function parseDotAmount(raw: string): bigint | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    return parseUnits(s, 18);
  } catch {
    return null;
  }
}

/** Whole-dot input string for max withdraw; trims trailing zeros after `formatUnits`. */
function escrowWeiToWithdrawField(wei: bigint): string {
  let s = formatUnits(wei, 18);
  if (!s.includes(".")) return s;
  s = s.replace(/\.?0+$/, "");
  return s || "0";
}

export default function FundPage() {
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { hubConfig, configError } = useHubChainConfig();

  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

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

  const {
    data: balanceRaw,
    refetch: refetchBalance,
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
  }, [
    chainReady,
    hubConfig,
    nativeBalanceFetched,
    nativeBalance,
  ]);

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

  const depositParsed = useMemo(() => parseDotAmount(depositAmt), [depositAmt]);
  const withdrawParsed = useMemo(
    () => parseDotAmount(withdrawAmt),
    [withdrawAmt],
  );

  async function handleDeposit() {
    if (
      !walletClient ||
      !hubConfig ||
      !chainReady ||
      escrowUnset ||
      !publicClient ||
      depositParsed === null ||
      depositParsed <= BigInt(0)
    )
      return;
    setTxBusy(true);
    setLastTxHash(null);
    setTxError(null);
    try {
      const hash = await depositDot(
        walletClient,
        publicClient,
        hubConfig.settlementEscrowAddress,
        depositParsed,
        hubConfig.nativeCurrency.decimals,
      );
      await waitForTransactionReceipt(publicClient, { hash });
      setLastTxHash(hash);
      await refetchBalance();
      await queryClient.invalidateQueries({ queryKey: ["balance"] });
      setDepositAmt("");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setTxBusy(false);
    }
  }

  async function handleWithdraw() {
    if (
      !walletClient ||
      !hubConfig ||
      !chainReady ||
      escrowUnset ||
      !publicClient ||
      withdrawParsed === null ||
      withdrawParsed <= BigInt(0)
    )
      return;
    setTxBusy(true);
    setLastTxHash(null);
    setTxError(null);
    try {
      const hash = await withdrawDot(
        walletClient,
        hubConfig.settlementEscrowAddress,
        withdrawParsed,
      );
      await waitForTransactionReceipt(publicClient, { hash });
      setLastTxHash(hash);
      await refetchBalance();
      await queryClient.invalidateQueries({ queryKey: ["balance"] });
      setWithdrawAmt("");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : "Withdraw failed");
    } finally {
      setTxBusy(false);
    }
  }

  const formsDisabled =
    !chainReady ||
    escrowUnset ||
    txBusy ||
    balanceLoading ||
    !walletClient ||
    !hubConfig;

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/c" font="body" underline={false}>
          ← Consumer
        </Link>

        <Text font="title2">Fund escrow</Text>
        <Text font="body" color="fgMuted">
          Deposit or withdraw native DOT through SettlementEscrow (internal
          balance shown with 18 decimals per whole DOT). Connect your wallet using
          the toolbar.
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
                Import Foundry Anvil’s default mnemonic (twelve words: “test … test
                junk”) or a printed dev private key so your wallet holds funded
                accounts on chain {hubConfig.chainId}.
              </Text>
              <Text font="caption" color="fgMuted">
                This portal calls{" "}
                <Text as="span" font="caption" mono tabularNumbers>
                  {hubConfig.rpcUrl}
                </Text>
                . In your wallet, add custom network {hubConfig.chainId} with that
                same RPC URL (if the page cannot reach it, try{" "}
                <Text as="span" font="caption" mono tabularNumbers>
                  http://127.0.0.1:8545
                </Text>{" "}
                when Anvil runs on the same machine as this browser, or your dev
                machine’s LAN IP when you use another device). Set{" "}
                <Text as="span" font="caption" mono>
                  NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB
                </Text>{" "}
                to the URL your wallet will use so reads and writes stay in sync.
              </Text>
              <Text font="caption" color="fgMuted">
                Deploy with{" "}
                <Text as="span" font="caption" mono>
                  sparkl-solo/contracts/script/DeployLocal.s.sol
                </Text>{" "}
                so SettlementEscrow uses 18‑decimal native (Anvil wei). Override
                symbol/name/decimals with{" "}
                <Text as="span" font="caption" mono>
                  NEXT_PUBLIC_NATIVE_*_ASSHUB_DEV_STUB
                </Text>{" "}
                if needed—they must match the deployed escrow and the wallet network.
                If you use{" "}
                <Text as="span" font="caption" mono>
                  NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY
                </Text>
                , Switch network from the toolbar so MetaMask stores your dev
                site’s <Text as="span" font="caption" mono>
                  /api/rpc
                </Text>{" "}
                URL (not raw{" "}
                <Text as="span" font="caption" mono>
                  :8545
                </Text>
                ); otherwise MetaMask may show Failed to fetch on send while the
                page still reads on-chain. Remove an old 31337 network entry if it
                still targets only Anvil’s port. Redeploy if your escrow predates the
                native‑decimals constructor.
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

        {hubConfig && escrowUnset && !configError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Settlement escrow address missing"
          >
            <VStack gap={1}>
              <Text font="body">
                NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_ASSHUB_DEV_STUB points at the
                zero address (placeholder only). Your wallet treated the action as a
                plain send to{" "}
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
                Deploy SettlementEscrow from sparkl-solo, set the real escrow address
                in .env, restart yarn dev, then deposit again.
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
              Connect a wallet from the toolbar to view your escrow balance and
              submit transactions.
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
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}) to fund
              escrow.
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

        <VStack gap={2}>
          <Text font="label2">Deposit DOT</Text>
          <Text font="caption" color="fgMuted">
            Amount in whole DOT (stored internally as 18‑dec units). Payable depositDot
            on Anvil uses 18‑dec wei (same scale as ETH in your wallet).
          </Text>
          <TextInput
            label="Amount"
            placeholder="0.0"
            value={depositAmt}
            onChange={(e) => setDepositAmt(e.target.value)}
            disabled={formsDisabled}
            suffix="DOT"
          />
          <Button
            variant="primary"
            disabled={
              formsDisabled ||
              depositParsed === null ||
              depositParsed <= BigInt(0)
            }
            loading={txBusy}
            onClick={() => void handleDeposit()}
          >
            Deposit DOT
          </Button>
        </VStack>

        <VStack gap={2}>
          <Text font="label2">Withdraw DOT (dev)</Text>
          <Text font="caption" color="fgMuted">
            Withdraws internal balance back to native DOT using withdrawDot.
          </Text>
          <TextInput
            width="100%"
            label="Amount"
            labelNode={
              <HStack
                width="100%"
                justifyContent="space-between"
                alignItems="center"
              >
                <Text font="label2">Amount</Text>
                <Button
                  accessibilityLabel="Fill withdraw amount with full escrow balance"
                  variant="secondary"
                  compact
                  disabled={
                    formsDisabled ||
                    balanceRaw === undefined ||
                    balanceRaw === null ||
                    typeof balanceRaw !== "bigint" ||
                    balanceRaw <= BigInt(0)
                  }
                  onClick={() => {
                    if (
                      balanceRaw !== undefined &&
                      balanceRaw !== null &&
                      typeof balanceRaw === "bigint" &&
                      balanceRaw > BigInt(0)
                    ) {
                      setWithdrawAmt(escrowWeiToWithdrawField(balanceRaw));
                    }
                  }}
                >
                  [max]
                </Button>
              </HStack>
            }
            placeholder="0.0"
            value={withdrawAmt}
            onChange={(e) => setWithdrawAmt(e.target.value)}
            disabled={formsDisabled}
            suffix="DOT"
          />
          <Button
            variant="secondary"
            disabled={
              formsDisabled ||
              withdrawParsed === null ||
              withdrawParsed <= BigInt(0)
            }
            loading={txBusy}
            onClick={() => void handleWithdraw()}
          >
            Withdraw DOT
          </Button>
        </VStack>

        {lastTxHash ? (
          <HStack gap={1}>
            <Text font="caption" color="fgMuted">
              Last transaction hash
            </Text>
            <Text font="caption" mono>
              {lastTxHash}
            </Text>
          </HStack>
        ) : null}

        {txError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Transaction error"
          >
            <Text font="body">{txError}</Text>
          </Banner>
        ) : null}
      </VStack>
    </Box>
  );
}
