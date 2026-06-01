"use client";

import { Banner } from "@coinbase/cds-web/banner";
import { Button } from "@coinbase/cds-web/buttons";
import { TextInput } from "@coinbase/cds-web/controls";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { SegmentedTabs } from "@coinbase/cds-web/tabs";
import { Text } from "@coinbase/cds-web/typography";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
import { internalToNative } from "@/lib/evm/dotUnits";
import { depositDot, withdrawDot } from "@/lib/evm/escrow";
import { formatTxError } from "@/lib/evm/formatTxError";
import { isWalletRpcTransportError } from "@/lib/evm/isWalletRpcTransportError";
import { probeInjectedWalletRpc } from "@/lib/evm/probeWalletRpc";
import {
  chainRpcUrl,
  isLocalDevChainRpc,
  portalPublicRpcUrl,
} from "@/lib/chains";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

const FUND_TABS = [
  { id: "fund" as const, label: "Fund" },
  { id: "withdraw" as const, label: "Withdraw" },
];

function parseDotAmount(raw: string): bigint | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    return parseUnits(s, 18);
  } catch {
    return null;
  }
}

function escrowWeiToWithdrawField(wei: bigint): string {
  let s = formatUnits(wei, 18);
  if (!s.includes(".")) return s;
  s = s.replace(/\.?0+$/, "");
  return s || "0";
}

export function UserFundPanel() {
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { hubConfig } = useHubChainConfig();

  const [activeTab, setActiveTab] = useState<(typeof FUND_TABS)[number]>(
    FUND_TABS[0],
  );
  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  /** Set by Max so withdraw uses exact on-chain wei (no parseUnits round-trip). */
  const [withdrawWeiExact, setWithdrawWeiExact] = useState<bigint | null>(null);
  const [txBusy, setTxBusy] = useState(false);
  const [devAnvilBusy, setDevAnvilBusy] = useState(false);
  const [walletRpcProbe, setWalletRpcProbe] = useState<string | null>(null);
  const [walletRpcProbeOk, setWalletRpcProbeOk] = useState<boolean | null>(null);
  const [walletRpcProbing, setWalletRpcProbing] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [txNotice, setTxNotice] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const isDevStub = hubConfig?.chainEnv === "assethub-dev-stub";
  const localAnvilBackend = hubConfig
    ? isLocalDevChainRpc(hubConfig.rpcUrl)
    : false;

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

  const { data: nativeBalance } = useBalance({
    address,
    query: { enabled: Boolean(chainReady && address) },
  });

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

  const formsDisabled =
    !chainReady ||
    escrowUnset ||
    txBusy ||
    balanceLoading ||
    !walletClient ||
    !hubConfig;

  const isFundTab = activeTab.id === "fund";

  async function probeWalletRpc() {
    if (!hubConfig || !chainReady || escrowUnset) return;
    setWalletRpcProbing(true);
    setWalletRpcProbe(null);
    setWalletRpcProbeOk(null);
    try {
      const result = await probeInjectedWalletRpc(hubConfig.chainId, {
        escrowAddress: hubConfig.settlementEscrowAddress,
        expectedChainRpcUrl: chainRpcUrl(hubConfig),
      });
      if (result.ok) {
        setWalletRpcProbeOk(true);
        setWalletRpcProbe(
          `Wallet chain RPC OK (chain ${result.chainId}, escrow bytecode present). Sends go to ${chainRpcUrl(hubConfig)} only.`,
        );
      } else {
        setWalletRpcProbeOk(false);
        setWalletRpcProbe(result.message);
      }
    } finally {
      setWalletRpcProbing(false);
    }
  }

  useEffect(() => {
    if (!chainReady || !hubConfig || escrowUnset) {
      setWalletRpcProbe(null);
      setWalletRpcProbeOk(null);
      return;
    }
    void probeWalletRpc();
  }, [
    chainReady,
    hubConfig?.chainId,
    hubConfig?.settlementEscrowAddress,
    hubConfig?.rpcUrl,
    escrowUnset,
  ]);

  async function postDevAnvilEscrow(
    action: "deposit" | "withdraw",
    amountInternal: bigint,
  ): Promise<`0x${string}`> {
    if (!address || !publicClient) {
      throw new Error("Wallet not connected");
    }
    const res = await fetch("/api/dev/anvil-escrow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        address,
        amountInternal: amountInternal.toString(),
      }),
    });
    const json = (await res.json()) as { hash?: string; error?: string };
    if (!res.ok || !json.hash) {
      throw new Error(json.error ?? `Dev ${action} failed (${res.status})`);
    }
    const hash = json.hash as `0x${string}`;
    await waitForTransactionReceipt(publicClient, { hash });
    return hash;
  }

  async function finishEscrowTx(
    action: "deposit" | "withdraw",
    hash: `0x${string}`,
    notice?: string,
  ) {
    setLastTxHash(hash);
    setTxError(null);
    setTxNotice(notice ?? null);
    await refetchBalance();
    await queryClient.invalidateQueries({ queryKey: ["balance"] });
    if (action === "deposit") setDepositAmt("");
    else {
      setWithdrawAmt("");
      setWithdrawWeiExact(null);
    }
  }

  async function tryAnvilEscrowFallback(
    action: "deposit" | "withdraw",
    amountInternal: bigint,
    walletErr: unknown,
  ): Promise<boolean> {
    if (!isDevStub || !localAnvilBackend) return false;
    try {
      const hash = await postDevAnvilEscrow(action, amountInternal);
      await finishEscrowTx(
        action,
        hash,
        "MetaMask could not reach its RPC; completed via local Anvil (dev bypass).",
      );
      return true;
    } catch (devErr) {
      setTxError(
        `${formatTxError(devErr)}\n\nWallet error:\n${formatTxError(walletErr)}`,
      );
      return true;
    }
  }

  async function handleDevAnvilEscrow(action: "deposit" | "withdraw") {
    if (
      !hubConfig ||
      !chainReady ||
      !address ||
      escrowUnset ||
      !publicClient
    )
      return;
    const amount =
      action === "deposit"
        ? depositParsed
        : (withdrawWeiExact ?? withdrawParsed);
    if (amount === null || amount <= BigInt(0)) return;

    setDevAnvilBusy(true);
    setLastTxHash(null);
    setTxNotice(null);
    setTxError(null);
    try {
      const hash = await postDevAnvilEscrow(action, amount);
      await finishEscrowTx(action, hash);
    } catch (e) {
      setTxError(formatTxError(e));
    } finally {
      setDevAnvilBusy(false);
    }
  }

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
    setTxNotice(null);
    setTxError(null);
    try {
      if (isDevStub) {
        const probe = await probeInjectedWalletRpc(hubConfig.chainId, {
          escrowAddress: hubConfig.settlementEscrowAddress,
          expectedChainRpcUrl: chainRpcUrl(hubConfig),
        });
        if (!probe.ok) {
          setTxError(
            `${probe.message}\n\nDeposit blocked until MetaMask uses the chain RPC from .env.`,
          );
          if (localAnvilBackend) {
            const ok = await tryAnvilEscrowFallback(
              "deposit",
              depositParsed,
              new Error(probe.message),
            );
            if (ok) return;
          }
          return;
        }
      }
      const valueWei = internalToNative(
        depositParsed,
        hubConfig.nativeCurrency.decimals,
      );
      if (nativeBalance && nativeBalance.value < valueWei) {
        setTxError(
          `Wallet balance is too low for a ${depositAmt.trim()} DOT deposit. You need at least ${formatUnits(valueWei, hubConfig.nativeCurrency.decimals)} ${hubConfig.nativeCurrency.symbol} in the wallet (plus gas).`,
        );
        return;
      }
      const hash = await depositDot(
        walletClient,
        publicClient,
        hubConfig.settlementEscrowAddress,
        depositParsed,
        hubConfig.nativeCurrency.decimals,
      );
      await finishEscrowTx("deposit", hash);
    } catch (e) {
      if (isWalletRpcTransportError(e)) {
        const ok = await tryAnvilEscrowFallback("deposit", depositParsed, e);
        if (ok) return;
      }
      setTxError(formatTxError(e));
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
    setTxNotice(null);
    setTxError(null);
    try {
      let amountInternal = withdrawWeiExact ?? withdrawParsed;
      if (
        balanceRaw !== undefined &&
        balanceRaw !== null &&
        typeof balanceRaw === "bigint" &&
        amountInternal > balanceRaw
      ) {
        amountInternal = balanceRaw;
      }
      if (isDevStub) {
        const probe = await probeInjectedWalletRpc(hubConfig.chainId, {
          escrowAddress: hubConfig.settlementEscrowAddress,
          expectedChainRpcUrl: chainRpcUrl(hubConfig),
        });
        if (!probe.ok) {
          setTxError(
            `${probe.message}\n\nWithdraw blocked until MetaMask uses the chain RPC from .env.`,
          );
          if (localAnvilBackend) {
            const ok = await tryAnvilEscrowFallback(
              "withdraw",
              amountInternal,
              new Error(probe.message),
            );
            if (ok) return;
          }
          return;
        }
      }
      const hash = await withdrawDot(
        walletClient,
        publicClient,
        hubConfig.settlementEscrowAddress,
        amountInternal,
      );
      await finishEscrowTx("withdraw", hash);
    } catch (e) {
      if (isWalletRpcTransportError(e)) {
        let amountInternal = withdrawWeiExact ?? withdrawParsed;
        if (
          balanceRaw !== undefined &&
          balanceRaw !== null &&
          typeof balanceRaw === "bigint" &&
          amountInternal > balanceRaw
        ) {
          amountInternal = balanceRaw;
        }
        const ok = await tryAnvilEscrowFallback("withdraw", amountInternal, e);
        if (ok) return;
      }
      setTxError(formatTxError(e));
    } finally {
      setTxBusy(false);
    }
  }

  return (
    <Box className="user-fund-panel">
      <VStack gap={3} alignItems="stretch">
        <VStack gap={0.5} alignItems="flex-start">
          <Text font="caption" color="fgMuted">
            Escrow balance
          </Text>
          <Text font="title2" mono tabularNumbers>
            {balanceLoading ? "…" : balanceDisplay}{" "}
            <Text as="span" font="body" color="fgMuted">
              DOT
            </Text>
          </Text>
        </VStack>

        <SegmentedTabs
          width="100%"
          tabs={FUND_TABS}
          activeTab={activeTab}
          onChange={(tab) => {
            if (tab) setActiveTab(tab);
          }}
        />

        <VStack gap={2} alignItems="stretch">
          <Text font="caption" color="fgMuted">
            {isFundTab
              ? "Deposit whole DOT via payable depositDot."
              : "Withdraw internal balance to native DOT."}
          </Text>

          {isFundTab ? (
            <TextInput
              label="Amount"
              placeholder="0.0"
              value={depositAmt}
              onChange={(e) => setDepositAmt(e.target.value)}
              disabled={formsDisabled}
              suffix="DOT"
            />
          ) : (
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
                        setWithdrawWeiExact(balanceRaw);
                        setWithdrawAmt(escrowWeiToWithdrawField(balanceRaw));
                      }
                    }}
                  >
                    Max
                  </Button>
                </HStack>
              }
              placeholder="0.0"
              value={withdrawAmt}
              onChange={(e) => {
                setWithdrawWeiExact(null);
                setWithdrawAmt(e.target.value);
              }}
              disabled={formsDisabled}
              suffix="DOT"
            />
          )}

          <Button
            variant="primary"
            width="100%"
            disabled={
              formsDisabled ||
              devAnvilBusy ||
              (isFundTab
                ? depositParsed === null || depositParsed <= BigInt(0)
                : withdrawParsed === null || withdrawParsed <= BigInt(0))
            }
            loading={txBusy}
            onClick={() =>
              void (isFundTab ? handleDeposit() : handleWithdraw())
            }
          >
            {isFundTab ? "Deposit DOT" : "Withdraw DOT"}
          </Button>

          {chainReady && !escrowUnset && hubConfig ? (
            <VStack gap={1} alignItems="stretch">
              {walletRpcProbeOk === false ? (
                <Banner variant="error" startIcon="warning" showDismiss={false}>
                  <Text font="caption" style={{ whiteSpace: "pre-wrap" }}>
                    {walletRpcProbe}
                  </Text>
                </Banner>
              ) : null}
              <Button
                variant="secondary"
                width="100%"
                compact
                loading={walletRpcProbing}
                disabled={walletRpcProbing || txBusy || devAnvilBusy}
                onClick={() => void probeWalletRpc()}
              >
                Test MetaMask chain RPC
              </Button>
              {walletRpcProbe && walletRpcProbeOk !== false ? (
                <Text font="caption" color="fgMuted" style={{ whiteSpace: "pre-wrap" }}>
                  {walletRpcProbe}
                </Text>
              ) : null}
            </VStack>
          ) : null}

          {isDevStub && localAnvilBackend && chainReady && !escrowUnset ? (
            <VStack gap={1} alignItems="stretch">
              <Button
                variant="secondary"
                width="100%"
                disabled={
                  txBusy ||
                  devAnvilBusy ||
                  (isFundTab
                    ? depositParsed === null || depositParsed <= BigInt(0)
                    : withdrawParsed === null || withdrawParsed <= BigInt(0))
                }
                loading={devAnvilBusy}
                onClick={() =>
                  void handleDevAnvilEscrow(isFundTab ? "deposit" : "withdraw")
                }
              >
                {isFundTab
                  ? "Dev deposit (Anvil, no MetaMask RPC)"
                  : "Dev withdraw (Anvil, no MetaMask RPC)"}
              </Button>
              <Text font="caption" color="fgMuted">
                Dev deposit impersonates your connected address on local Anvil via
                the server RPC_PROXY_TARGET. Use when MetaMask shows Failed to fetch
                and the Next terminal never logs eth_sendTransaction.
              </Text>
            </VStack>
          ) : null}
        </VStack>

        {lastTxHash ? (
          <VStack gap={0.5} alignItems="flex-start">
            <Text font="caption" color="fgMuted">
              Last transaction
            </Text>
            <Text font="caption" mono style={{ wordBreak: "break-all" }}>
              {lastTxHash}
            </Text>
          </VStack>
        ) : null}

        {txNotice ? (
          <Banner variant="informational" startIcon="info" showDismiss={false}>
            <Text font="caption">{txNotice}</Text>
          </Banner>
        ) : null}

        {hubConfig?.chainEnv === "assethub-dev-stub" && chainReady && !escrowUnset ? (
          <Text font="caption" color="fgMuted">
            MetaMask must use chain RPC{" "}
            <Text as="span" font="caption" mono>
              {chainRpcUrl(hubConfig)}
            </Text>
            . Portal reads use{" "}
            <Text as="span" font="caption" mono>
              {typeof window !== "undefined"
                ? portalPublicRpcUrl(hubConfig, window.location.origin)
                : "…/api/rpc"}
            </Text>{" "}
            (not for wallet sends). Toolbar → Fix wallet RPC registers{" "}
            <Text as="span" font="caption" mono>
              {chainRpcUrl(hubConfig)}
            </Text>
            . Ignore proxy logs where{" "}
            <Text as="span" font="caption" mono>
              symbol()
            </Text>{" "}
            /{" "}
            <Text as="span" font="caption" mono>
              balanceOf
            </Text>{" "}
            revert on the escrow.
          </Text>
        ) : null}

        {txError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Transaction error"
          >
            <Text font="caption" style={{ whiteSpace: "pre-wrap" }}>
              {txError}
            </Text>
          </Banner>
        ) : null}
      </VStack>
    </Box>
  );
}
