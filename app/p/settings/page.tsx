"use client";

import { DataCard } from "@coinbase/cds-web/alpha/data-card";
import { Banner } from "@coinbase/cds-web/banner";
import { Button } from "@coinbase/cds-web/buttons";
import { Switch, TextInput } from "@coinbase/cds-web/controls";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useCallback, useMemo, useState } from "react";
import { type Address, getAddress, isAddress, zeroHash } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import {
  getProvider,
  setNodeActive,
  setNodePayout,
} from "@/lib/evm/registry";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

function teeProofSubmitted(hash: `0x${string}`): boolean {
  return hash.toLowerCase() !== zeroHash.toLowerCase();
}

function parsePayout(raw: string): Address | null {
  const s = raw.trim();
  if (!s) return null;
  if (!isAddress(s)) return null;
  try {
    return getAddress(s);
  } catch {
    return null;
  }
}

export default function ProviderSettingsPage() {
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { hubConfig, configError } = useHubChainConfig();

  const [newPayoutInput, setNewPayoutInput] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const chainReady = Boolean(
    isConnected &&
      hubConfig &&
      chainId === hubConfig.chainId &&
      address,
  );

  const registryUnset = useMemo(() => {
    if (!hubConfig?.providerRegistryAddress) return true;
    return (
      hubConfig.providerRegistryAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    );
  }, [hubConfig]);

  const {
    data: providerInfo,
    error: providerQueryError,
    isFetching: providerLoading,
    refetch: refetchProvider,
  } = useQuery({
    queryKey: [
      "providerSettings",
      hubConfig?.chainId,
      hubConfig?.providerRegistryAddress,
      address,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !address) {
        throw new Error("Missing RPC client, hub config, or wallet address");
      }
      return getProvider(
        publicClient,
        hubConfig.providerRegistryAddress,
        address,
      );
    },
    enabled: Boolean(
      chainReady &&
        hubConfig &&
        address &&
        publicClient &&
        !registryUnset &&
        !configError,
    ),
  });

  const isRegistered =
    providerInfo &&
    providerInfo.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();

  const providerErrMsg =
    providerQueryError instanceof Error
      ? providerQueryError.message
      : "Could not load provider";

  const formDisabled =
    !chainReady ||
    registryUnset ||
    txBusy ||
    !walletClient ||
    !hubConfig ||
    !isRegistered ||
    providerLoading;

  const runTx = useCallback(
    async (send: () => Promise<`0x${string}`>) => {
      if (!walletClient || !hubConfig || !publicClient || !chainReady) return;
      setTxBusy(true);
      setTxError(null);
      setLastTxHash(null);
      try {
        const hash = await send();
        await waitForTransactionReceipt(publicClient, { hash });
        setLastTxHash(hash);
        await queryClient.invalidateQueries({ queryKey: ["providerDashboard"] });
        await queryClient.invalidateQueries({ queryKey: ["providerRegistered"] });
        await queryClient.invalidateQueries({ queryKey: ["providerSettings"] });
        await refetchProvider();
      } catch (e) {
        setTxError(e instanceof Error ? e.message : "Transaction failed");
      } finally {
        setTxBusy(false);
      }
    },
    [
      chainReady,
      hubConfig,
      publicClient,
      queryClient,
      refetchProvider,
      walletClient,
    ],
  );

  const parsedNewPayout = useMemo(
    () => parsePayout(newPayoutInput),
    [newPayoutInput],
  );
  const payoutChanged = Boolean(
    parsedNewPayout &&
      providerInfo &&
      parsedNewPayout.toLowerCase() !== providerInfo.payout.toLowerCase(),
  );

  async function handleUpdatePayout() {
    if (
      !walletClient ||
      !hubConfig ||
      !parsedNewPayout ||
      !address ||
      !payoutChanged
    )
      return;
    await runTx(() =>
      setNodePayout(
        walletClient,
        hubConfig.providerRegistryAddress,
        address,
        parsedNewPayout,
      ),
    );
    setNewPayoutInput("");
  }

  async function handleActiveToggle(nextActive: boolean) {
    if (!walletClient || !hubConfig || !providerInfo || !address) return;
    if (nextActive === providerInfo.active) return;
    await runTx(() =>
      setNodeActive(
        walletClient,
        hubConfig.providerRegistryAddress,
        address,
        nextActive,
      ),
    );
  }

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/p" font="body" underline={false}>
          ← Provider
        </Link>

        <Text font="title2">Update registration</Text>
        <Text font="body" color="fgMuted">
          View your on-chain node record (node ID = connected wallet for this page)
          and update payout or listing status when this wallet is the operator.
        </Text>

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

        {hubConfig && registryUnset && !configError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Provider registry address missing"
          >
            <Text font="body">
              Set <Text as="span" font="body" mono>
                NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_*
              </Text>{" "}
              in <Text as="span" font="body" mono>.env</Text>.
            </Text>
          </Banner>
        ) : null}

        {!isConnected ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="Wallet disconnected"
          >
            <Text font="body">Connect a wallet from the toolbar.</Text>
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
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).
            </Text>
          </Banner>
        ) : null}

        {chainReady &&
        !registryUnset &&
        !configError &&
        !providerLoading &&
        !providerQueryError &&
        providerInfo &&
        !isRegistered ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="Not registered"
          >
            <Text font="body">
              This wallet is not a registered provider.{" "}
              <Link as={NextLink} href="/p/register" font="body" underline>
                Register your node
              </Link>
            </Text>
          </Banner>
        ) : null}

        {chainReady && !registryUnset && !configError && providerQueryError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Registry read failed"
          >
            <Text font="body">{providerErrMsg}</Text>
          </Banner>
        ) : null}

        {chainReady && !registryUnset && !configError && providerLoading ? (
          <Text font="body" color="fgMuted">
            Loading provider…
          </Text>
        ) : null}

        {lastTxHash ? (
          <Banner
            variant="informational"
            startIcon="checkmark"
            showDismiss={false}
            title="Transaction confirmed"
          >
            <Text font="body" mono tabularNumbers>
              {lastTxHash}
            </Text>
          </Banner>
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

        {isRegistered && providerInfo ? (
          <>
            <Text font="label2" color="fgMuted">
              On-chain record (read-only)
            </Text>
            <Box
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 16,
                width: "100%",
              }}
            >
              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Payout address
                  </Text>
                }
                subtitle={
                  <Text font="title3" mono tabularNumbers>
                    {providerInfo.payout}
                  </Text>
                }
              />
              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Fee (basis points)
                  </Text>
                }
                subtitle={
                  <Text font="title3" mono tabularNumbers>
                    {providerInfo.feeBps}
                  </Text>
                }
              />
              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Active
                  </Text>
                }
                subtitle={
                  <HStack gap={2} alignItems="center">
                    <Box
                      width={8}
                      height={8}
                      style={{
                        borderRadius: 9999,
                        backgroundColor: providerInfo.active
                          ? "#16a34a"
                          : "#dc2626",
                        flexShrink: 0,
                      }}
                    />
                    <Text font="title3">
                      {providerInfo.active ? "Yes" : "No"}
                    </Text>
                  </HStack>
                }
              />
              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Supports Best Effort
                  </Text>
                }
                subtitle={
                  <Text font="title3">
                    {providerInfo.supportsBestEffort ? "Yes" : "No"}
                  </Text>
                }
              />
              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Supports TEE
                  </Text>
                }
                subtitle={
                  <Text font="title3">
                    {providerInfo.supportsTEE ? "Yes" : "No"}
                  </Text>
                }
              />
              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    TEE report hash
                  </Text>
                }
                subtitle={
                  <VStack gap={1} alignItems="flex-start">
                    <Text font="title3">
                      {teeProofSubmitted(providerInfo.teeReportHash)
                        ? "Set"
                        : "Empty"}
                    </Text>
                    {teeProofSubmitted(providerInfo.teeReportHash) ? (
                      <Text font="caption" mono tabularNumbers color="fgMuted">
                        {providerInfo.teeReportHash}
                      </Text>
                    ) : null}
                  </VStack>
                }
              />
            </Box>

            <VStack gap={2}>
              <Text font="label2">Update payout</Text>
              <Text font="caption" color="fgMuted">
                Current payout is shown above. Enter a new address and submit.
              </Text>
              <TextInput
                label="New payout address"
                placeholder="0x…"
                value={newPayoutInput}
                onChange={(e) => setNewPayoutInput(e.target.value)}
                disabled={formDisabled}
              />
              <Button
                variant="primary"
                disabled={
                  formDisabled || !parsedNewPayout || !payoutChanged
                }
                loading={txBusy}
                onClick={() => void handleUpdatePayout()}
              >
                Update payout on-chain
              </Button>
            </VStack>

            <VStack gap={1} alignItems="flex-start">
              <Text font="label2">Listing status</Text>
              <Text font="caption" color="fgMuted">
                Active providers accept new sessions; inactive pauses your node
                listing.
              </Text>
              <Switch
                checked={providerInfo.active}
                disabled={formDisabled}
                value="active"
                onChange={(e) => void handleActiveToggle(e.target.checked)}
                accessibilityLabel="Provider active on-chain"
              >
                Active (listed)
              </Switch>
            </VStack>
          </>
        ) : null}
      </VStack>
    </Box>
  );
}
