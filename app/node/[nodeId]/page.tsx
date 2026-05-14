"use client";

import { DataCard } from "@coinbase/cds-web/alpha/data-card";
import { Banner } from "@coinbase/cds-web/banner";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@coinbase/cds-web/overlays";
import { Button } from "@coinbase/cds-web/buttons";
import { Switch, TextInput } from "@coinbase/cds-web/controls";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useCallback } from "react";
import {
  getAddress,
  isAddress,
  zeroHash,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
} from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import { readOpenSessionCount } from "@/lib/evm/escrow";
import { formatTxError } from "@/lib/evm/formatTxError";
import {
  chillNode,
  getNodeOperator,
  getProvider,
  lifecycleLabel,
  markDefunct,
  setNodeActive,
  setNodeMetadata,
  setNodePayout,
} from "@/lib/evm/registry";
import {
  parseNodeIdRouteSegment,
  peerIdMultihashHex,
} from "@/lib/nodeId";
import {
  metadataUriToBaseUrl,
  normalizeNodeBaseUrl,
} from "@/lib/nodeBaseUrl";
import { type ProviderInfo, NodeLifecycle } from "@/lib/types";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

function teeProofSubmitted(hash: `0x${string}`): boolean {
  return hash.toLowerCase() !== zeroHash.toLowerCase();
}

function parsePayout(raw: string): Address | null {
  const s = raw.trim();
  if (!s || !isAddress(s)) return null;
  try {
    return getAddress(s);
  } catch {
    return null;
  }
}

type LoadedNodeDetail = {
  info: ProviderInfo;
  operator: Address;
  isRegistered: true;
  openSessionCount: bigint;
};

function NodeOperatorControls({
  nodeId,
  detail,
  registryAddress,
  settlementEscrowAddress,
  controlsDisabled,
  walletClient,
  publicClient,
  queryClient,
  refetchDetail,
}: {
  nodeId: Hex;
  detail: LoadedNodeDetail;
  registryAddress: Address;
  settlementEscrowAddress: Address;
  controlsDisabled: boolean;
  walletClient: WalletClient;
  publicClient: PublicClient;
  queryClient: QueryClient;
  refetchDetail: () => Promise<unknown>;
}) {
  const { address: connectedAddress } = useAccount();
  const [newPayoutInput, setNewPayoutInput] = useState("");
  const [newBaseUrlInput, setNewBaseUrlInput] = useState(
    () =>
      metadataUriToBaseUrl(detail.info.metadataURI ?? "") ??
      detail.info.metadataURI ??
      "",
  );
  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [chillModalOpen, setChillModalOpen] = useState(false);
  const [defunctModalOpen, setDefunctModalOpen] = useState(false);

  const { data: pendingAhead = 0 } = useQuery({
    queryKey: [
      "walletPendingNonceGap",
      publicClient?.chain?.id,
      connectedAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !connectedAddress) return 0;
      try {
        const latest = await publicClient.getTransactionCount({
          address: connectedAddress,
          blockTag: "latest",
        });
        const pending = await publicClient.getTransactionCount({
          address: connectedAddress,
          blockTag: "pending",
        });
        return Math.max(0, pending - latest);
      } catch {
        return 0;
      }
    },
    enabled: Boolean(publicClient && connectedAddress),
    refetchInterval: 12_000,
  });

  const manageDisabled = controlsDisabled || txBusy;

  const baseUrlSaveDisabled = useMemo(() => {
    const next = normalizeNodeBaseUrl(newBaseUrlInput.trim());
    const currentRaw = detail.info.metadataURI ?? "";
    const current =
      metadataUriToBaseUrl(currentRaw) ?? normalizeNodeBaseUrl(currentRaw);
    if (!next) return true;
    if (current && next === current) return true;
    return false;
  }, [newBaseUrlInput, detail.info.metadataURI]);

  const runTx = useCallback(
    async (
      send: () => Promise<`0x${string}`>,
      onSuccess?: () => void | Promise<void>,
    ) => {
      setTxBusy(true);
      setTxError(null);
      setLastTxHash(null);
      try {
        const hash = await send();
        const receipt = await waitForTransactionReceipt(publicClient, {
          hash,
        });
        if (receipt.status === "reverted") {
          throw new Error(
            "Transaction was mined but reverted on-chain. Compare your wallet network with the hub chain, and confirm you are the operator for this node id.",
          );
        }
        setLastTxHash(hash);
        await queryClient.invalidateQueries({ queryKey: ["nodeDetail"] });
        await queryClient.invalidateQueries({ queryKey: ["allRegistryNodes"] });
        await queryClient.invalidateQueries({ queryKey: ["operatorNodesPage"] });
        await queryClient.invalidateQueries({
          queryKey: ["providerDirectory"],
        });
        await queryClient.invalidateQueries({ queryKey: ["providerDetail"] });
        await queryClient.invalidateQueries({ queryKey: ["nodeOpenSessions"] });
        await refetchDetail();
        await onSuccess?.();
      } catch (e) {
        setTxError(formatTxError(e));
      } finally {
        setTxBusy(false);
      }
    },
    [publicClient, queryClient, refetchDetail],
  );

  async function handleActiveToggle(nextActive: boolean) {
    if (nextActive === detail.info.active) return;
    await runTx(() =>
      setNodeActive(walletClient, registryAddress, nodeId, nextActive),
    );
  }

  async function handlePayoutUpdate() {
    const next = parsePayout(newPayoutInput);
    if (
      !next ||
      next.toLowerCase() === detail.info.payout.toLowerCase()
    )
      return;
    await runTx(() =>
      setNodePayout(walletClient, registryAddress, nodeId, next),
    );
    setNewPayoutInput("");
  }

  async function handleBaseUrlUpdate() {
    const base = normalizeNodeBaseUrl(newBaseUrlInput);
    if (!base) {
      setTxError(
        "Enter a valid http(s) node base URL (host, optional port — used for /status, /identity, /v1/models).",
      );
      return;
    }
    const currentRaw = detail.info.metadataURI ?? "";
    const currentBase =
      metadataUriToBaseUrl(currentRaw) ?? normalizeNodeBaseUrl(currentRaw);
    if (currentBase && base === currentBase) return;
    setTxError(null);
    await runTx(() =>
      setNodeMetadata(walletClient, registryAddress, nodeId, base),
    );
  }

  const escrowConfigured =
    settlementEscrowAddress.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const canChill = detail.info.lifecycle === NodeLifecycle.Active;
  const canMarkDefunct =
    detail.info.lifecycle === NodeLifecycle.Chilled &&
    escrowConfigured &&
    detail.openSessionCount === 0n;

  function openChillModal() {
    setTxError(null);
    setChillModalOpen(true);
  }

  function closeChillModal() {
    if (txBusy) return;
    setChillModalOpen(false);
  }

  function openDefunctModal() {
    setTxError(null);
    setDefunctModalOpen(true);
  }

  function closeDefunctModal() {
    if (txBusy) return;
    setDefunctModalOpen(false);
  }

  async function confirmChill() {
    setChillModalOpen(false);
    await runTx(() =>
      chillNode(walletClient, publicClient, registryAddress, nodeId),
    );
  }

  async function confirmMarkDefunct() {
    setDefunctModalOpen(false);
    await runTx(() =>
      markDefunct(
        walletClient,
        publicClient,
        registryAddress,
        settlementEscrowAddress,
        nodeId,
      ),
    );
  }

  return (
    <VStack gap={3} alignItems="stretch">
      <Text font="label2" color="fgMuted">
        Operator controls
      </Text>

      {pendingAhead > 0 ? (
        <Banner
          variant="warning"
          startIcon="warning"
          showDismiss={false}
          title="Pending transactions"
        >
          <Text font="body">
            This wallet has about {pendingAhead} pending transaction
            {pendingAhead === 1 ? "" : "s"} (nonce ahead of latest confirmed).
            New transactions can fail or appear stuck until those confirm or
            are cancelled in your wallet.
          </Text>
        </Banner>
      ) : null}

      <Modal
        visible={chillModalOpen}
        onRequestClose={closeChillModal}
        accessibilityLabel="Confirm chill node"
        role="alertdialog"
      >
        <ModalHeader title="Chill this node?" />
        <ModalBody paddingX={3} paddingY={2}>
          <VStack gap={2} alignItems="flex-start">
            <Text font="body" color="fgMuted">
              Chilling sets lifecycle to Chilled and clears listing (no new escrow
              opens for this node id). Existing sessions can still record usage and
              settle. See the Sparkl `contracts/README.md` (“Node rundown”) in the
              sparkl-solo repo for semantics.
            </Text>
            <Text font="caption" color="fgMuted">
              On-chain operator
            </Text>
            <Text
              font="caption"
              mono
              tabularNumbers
              style={{ wordBreak: "break-all" }}
            >
              {detail.operator}
            </Text>
            {pendingAhead > 0 ? (
              <Banner
                variant="warning"
                startIcon="warning"
                showDismiss={false}
                title="Pending transactions"
              >
                <Text font="caption">
                  You have pending transactions—consider waiting for them to
                  confirm before chilling.
                </Text>
              </Banner>
            ) : null}
          </VStack>
        </ModalBody>
        <ModalFooter
          secondaryAction={
            <Button
              variant="secondary"
              disabled={txBusy}
              onClick={closeChillModal}
            >
              Cancel
            </Button>
          }
          primaryAction={
            <Button
              variant="negative"
              disabled={txBusy}
              onClick={() => void confirmChill()}
            >
              Chill node
            </Button>
          }
        />
      </Modal>

      <Modal
        visible={defunctModalOpen}
        onRequestClose={closeDefunctModal}
        accessibilityLabel="Confirm mark node defunct"
        role="alertdialog"
      >
        <ModalHeader title="Mark node defunct?" />
        <ModalBody paddingX={3} paddingY={2}>
          <VStack gap={2} alignItems="flex-start">
            <Text font="body" color="fgMuted">
              This sets lifecycle to Defunct on-chain while keeping operator and
              metadata for history (no delete). The registry owner can later
              purge the id if the chain is configured for it.
            </Text>
            {!escrowConfigured ? (
              <Banner
                variant="error"
                startIcon="warning"
                showDismiss={false}
                title="Escrow address missing"
              >
                <Text font="caption">
                  Set NEXT_PUBLIC_SETTLEMENT_ESCROW_* in the portal env so the
                  registry can read open session counts (and ensure
                  setSettlementEscrow was run on deploy).
                </Text>
              </Banner>
            ) : null}
            {escrowConfigured && detail.openSessionCount > 0n ? (
              <Banner
                variant="warning"
                startIcon="warning"
                showDismiss={false}
                title="Sessions still open"
              >
                <Text font="caption">
                  Open escrow sessions for this node:{" "}
                  {detail.openSessionCount.toString()}. Settle them first.
                </Text>
              </Banner>
            ) : null}
          </VStack>
        </ModalBody>
        <ModalFooter
          secondaryAction={
            <Button
              variant="secondary"
              disabled={txBusy}
              onClick={closeDefunctModal}
            >
              Cancel
            </Button>
          }
          primaryAction={
            <Button
              variant="negative"
              disabled={txBusy || !canMarkDefunct}
              onClick={() => void confirmMarkDefunct()}
            >
              Mark defunct
            </Button>
          }
        />
      </Modal>

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
          <Text font="body" style={{ whiteSpace: "pre-wrap" }}>
            {txError}
          </Text>
        </Banner>
      ) : null}

      <VStack gap={1} alignItems="flex-start">
        <Text font="label2">Listing status</Text>
        {detail.info.lifecycle !== NodeLifecycle.Active ? (
          <Text font="caption" color="fgMuted">
            While Chilled or Defunct you cannot toggle listing alone — chill already
            forces inactive; settling and mark defunct control the rundown.
          </Text>
        ) : null}
        <Switch
          checked={detail.info.active}
          disabled={
            manageDisabled ||
            detail.info.lifecycle !== NodeLifecycle.Active
          }
          value="active"
          onChange={(e) => void handleActiveToggle(e.target.checked)}
          accessibilityLabel="Node active on-chain"
        >
          Active (listed)
        </Switch>
      </VStack>

      <VStack gap={2}>
        <Text font="label2">Update payout</Text>
        <TextInput
          label="New payout address"
          placeholder="0x…"
          value={newPayoutInput}
          onChange={(e) => setNewPayoutInput(e.target.value)}
          disabled={manageDisabled}
        />
        <Button
          variant="primary"
          disabled={
            manageDisabled ||
            !parsePayout(newPayoutInput) ||
            parsePayout(newPayoutInput)?.toLowerCase() ===
              detail.info.payout.toLowerCase()
          }
          loading={txBusy}
          onClick={() => void handlePayoutUpdate()}
        >
          Update payout
        </Button>
      </VStack>

      <VStack gap={2}>
        <Text font="label2">Node base URL</Text>
        <Text font="caption" color="fgMuted">
          HTTP(S) origin (or JSON metadata with{" "}
          <Text as="span" font="caption" mono>
            baseUrl
          </Text>
          ) stored on-chain; your process should serve{" "}
          <Text as="span" font="caption" mono>
            /status
          </Text>
          ,{" "}
          <Text as="span" font="caption" mono>
            /identity
          </Text>
          ,{" "}
          <Text as="span" font="caption" mono>
            /v1/models
          </Text>
          .
        </Text>
        <TextInput
          label="Node base URL"
          placeholder="https://node.example.com:8787"
          value={newBaseUrlInput}
          onChange={(e) => setNewBaseUrlInput(e.target.value)}
          disabled={manageDisabled}
        />
        <Button
          variant="primary"
          disabled={manageDisabled || baseUrlSaveDisabled}
          loading={txBusy}
          onClick={() => void handleBaseUrlUpdate()}
        >
          Update base URL
        </Button>
      </VStack>

      <VStack gap={2}>
        <Text font="label2" color="fgMuted">
          Rundown (chill → defunct)
        </Text>
        <Text font="caption" color="fgMuted">
          Lifecycle is{" "}
          <Text as="span" font="caption">
            {lifecycleLabel(detail.info.lifecycle)}
          </Text>
          . Escrow sessions still open on this node id:{" "}
          {!escrowConfigured ? (
            <Text as="span" font="caption">
              (escrow unset in env — counter reads as 0; register owner must deploy
              and wire escrow)
            </Text>
          ) : (
            <Text as="span" font="caption" mono tabularNumbers>
              {detail.openSessionCount.toString()}
            </Text>
          )}
          .
        </Text>
        {detail.info.lifecycle === NodeLifecycle.Defunct ? (
          <Banner
            variant="informational"
            startIcon="checkmark"
            showDismiss={false}
            title="Defunct on-chain"
          >
            <Text font="caption" color="fgMuted">
              The operator record stays for audits. The registry owner may purge
              the node id separately when the protocol allows it (`purgeDefunctNode`
              on the registry contract).
            </Text>
          </Banner>
        ) : null}
        <Banner
          variant="warning"
          startIcon="warning"
          showDismiss={false}
          title="Stopping new bookings"
        >
          <Text font="caption" color="fgMuted">
            Chill first (allowed with open sessions), settle everything, then mark
            defunct when the escrow open-session counter is zero — there is no
            operator-triggered registry delete anymore.
          </Text>
        </Banner>
        <HStack gap={2} style={{ flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            disabled={
              manageDisabled || !canChill || pendingAhead > 0
            }
            loading={txBusy}
            accessibilityLabel="Chill this node — stop new sessions"
            onClick={() => openChillModal()}
          >
            Chill node
          </Button>
          <Button
            variant="negative"
            disabled={
              manageDisabled ||
              detail.info.lifecycle !== NodeLifecycle.Chilled ||
              pendingAhead > 0
            }
            loading={txBusy}
            accessibilityLabel={
              !canMarkDefunct
                ? "Mark defunct — disabled until escrow count is zero"
                : "Mark defunct node"
            }
            onClick={() => openDefunctModal()}
          >
            Mark defunct…
          </Button>
        </HStack>
        {!canMarkDefunct &&
        detail.info.lifecycle === NodeLifecycle.Chilled &&
        escrowConfigured &&
        detail.openSessionCount > 0n ? (
          <Text font="caption" color="fgMuted">
            Mark defunct unlocks automatically when escrow open-session count
            reaches 0 — use Sessions to settle in-flight ledger rows.
          </Text>
        ) : null}
      </VStack>
    </VStack>
  );
}

export default function NodeDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const raw =
    typeof params.nodeId === "string"
      ? params.nodeId
      : Array.isArray(params.nodeId)
        ? params.nodeId[0]
        : "";

  const parsedRoute = useMemo(() => parseNodeIdRouteSegment(raw), [raw]);
  const nodeIdFromRoute = parsedRoute.nodeId;
  const peerIdDisplay = parsedRoute.peerIdDisplay;
  const pathSegmentForLinks = useMemo(() => {
    if (!nodeIdFromRoute) return "";
    return peerIdDisplay ?? nodeIdFromRoute;
  }, [nodeIdFromRoute, peerIdDisplay]);

  const multihashHex = useMemo(
    () => (peerIdDisplay ? peerIdMultihashHex(peerIdDisplay) : null),
    [peerIdDisplay],
  );

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { hubConfig, configError } = useHubChainConfig();

  const registryUnset = useMemo(() => {
    if (!hubConfig?.providerRegistryAddress) return true;
    return (
      hubConfig.providerRegistryAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    );
  }, [hubConfig]);

  const publicClient = usePublicClient({
    chainId: hubConfig?.chainId,
  });
  const { data: walletClient } = useWalletClient({
    chainId: hubConfig?.chainId,
  });

  const chainReady = Boolean(
    hubConfig && chainId === hubConfig.chainId && isConnected,
  );

  const detailQueryReady = Boolean(
    hubConfig && nodeIdFromRoute && !registryUnset && !configError,
  );

  const {
    data: detail,
    error: detailError,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: [
      "nodeDetail",
      hubConfig?.chainId,
      hubConfig?.providerRegistryAddress,
      nodeIdFromRoute,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !nodeIdFromRoute) {
        throw new Error("Missing RPC client, hub config, or node ID");
      }
      const registry = hubConfig.providerRegistryAddress;
      const info = await getProvider(publicClient, registry, nodeIdFromRoute);
      const operator = await getNodeOperator(
        publicClient,
        registry,
        nodeIdFromRoute,
      );
      const openSessionCount = await readOpenSessionCount(
        publicClient,
        hubConfig.settlementEscrowAddress,
        nodeIdFromRoute,
      );
      const isRegistered =
        info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();

      return { info, operator, isRegistered, openSessionCount };
    },
    enabled: Boolean(
      detailQueryReady && publicClient,
    ),
  });

  const isOperator = Boolean(
    address &&
      detail?.operator &&
      getAddress(address).toLowerCase() ===
        getAddress(detail.operator).toLowerCase(),
  );

  const controlsDisabled =
    !chainReady ||
    registryUnset ||
    !walletClient ||
    !hubConfig ||
    detailLoading;

  const detailErrMsg =
    detailError instanceof Error ? detailError.message : "Could not load node";

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/node" font="body" underline={false}>
          ← Nodes
        </Link>

        <Text font="title2">Node</Text>

        {!nodeIdFromRoute ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Invalid node ID"
          >
            <Text font="body">
              This URL must include a valid node identity: a libp2p peer id (
              <Text as="span" font="body" mono>
                12D3Koo…
              </Text>{" "}
              base58),{" "}
              <Text as="span" font="body" mono>
                0x
              </Text>
              + 64 hex (
              <Text as="span" font="body" mono>
                bytes32
              </Text>
              ), or an Ethereum address (padded to{" "}
              <Text as="span" font="body" mono>
                bytes32
              </Text>{" "}
              for dev).
            </Text>
          </Banner>
        ) : (
          <VStack gap={1} alignItems="flex-start">
            {peerIdDisplay ? (
              <>
                <Text font="label2" color="fgMuted">
                  Peer ID (libp2p)
                </Text>
                <Text
                  font="body"
                  mono
                  tabularNumbers
                  style={{ wordBreak: "break-all" }}
                >
                  {peerIdDisplay}
                </Text>
                {multihashHex ? (
                  <VStack gap={0} alignItems="flex-start">
                    <Text font="caption" color="fgMuted">
                      Decoded multihash (hex)
                    </Text>
                    <Text
                      font="caption"
                      mono
                      tabularNumbers
                      color="fgMuted"
                      style={{ wordBreak: "break-all" }}
                    >
                      {multihashHex}
                    </Text>
                  </VStack>
                ) : null}
              </>
            ) : null}
            <Text font="label2" color="fgMuted">
              On-chain node id (
              <Text as="span" font="caption" mono>
                bytes32
              </Text>
              )
            </Text>
            <Text
              font="caption"
              mono
              tabularNumbers
              color="fgMuted"
              style={{ wordBreak: "break-all" }}
            >
              {nodeIdFromRoute}
            </Text>
          </VStack>
        )}

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
              Set a deployed ProviderRegistry in your env (see .env.example),
              then restart the dev server.
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
              load on-chain data.
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
            <Text font="body">
              You can still view registry data for this node. Connect a wallet
              on the hub chain to sign updates or switch networks if prompted.
            </Text>
          </Banner>
        ) : null}

        {nodeIdFromRoute &&
        detailQueryReady &&
        detailError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Registry read failed"
          >
            <Text font="body">{detailErrMsg}</Text>
          </Banner>
        ) : null}

        {nodeIdFromRoute && detailQueryReady && detailLoading ? (
          <Text font="body" color="fgMuted">
            Loading node…
          </Text>
        ) : null}

        {nodeIdFromRoute &&
        detailQueryReady &&
        detail?.isRegistered === false &&
        !detailLoading ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="Not registered"
          >
            <Text font="body">
              There is no ProviderRegistry entry for this node ID.
            </Text>
          </Banner>
        ) : null}

        {nodeIdFromRoute &&
        detailQueryReady &&
        !detailLoading &&
        !detailError &&
        detail?.isRegistered ? (
          <>
            {detail && !isOperator ? (
              <Banner
                variant="informational"
                startIcon="wallet"
                showDismiss={false}
                title="Read-only"
              >
                <Text font="body">
                  Connect the operator wallet (
                  <Text as="span" font="body" mono>
                    {detail.operator}
                  </Text>
                  ) to change payout, node base URL, or listing status.
                </Text>
              </Banner>
            ) : null}

            <HStack gap={2} style={{ flexWrap: "wrap" }}>
              <Link as={NextLink} href="/node/register" font="body">
                Register another
              </Link>
              <Text font="body" color="fgMuted">
                ·
              </Text>
              <Link
                as={NextLink}
                href={`/node/${encodeURIComponent(pathSegmentForLinks)}/sessions`}
                font="body"
              >
                Sessions
              </Link>
            </HStack>

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
                    Operator
                  </Text>
                }
                subtitle={
                  <Text font="title3" mono tabularNumbers>
                    {detail.operator}
                  </Text>
                }
              />

              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Lifecycle
                  </Text>
                }
                subtitle={
                  <HStack gap={2} alignItems="center">
                    <Box
                      width={8}
                      height={8}
                      style={{
                        borderRadius: 9999,
                        backgroundColor:
                          detail.info.lifecycle === NodeLifecycle.Active
                            ? "#16a34a"
                            : detail.info.lifecycle === NodeLifecycle.Chilled
                              ? "#d97706"
                              : "#64748b",
                        flexShrink: 0,
                      }}
                    />
                    <Text font="title3">{lifecycleLabel(detail.info.lifecycle)}</Text>
                  </HStack>
                }
              />

              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Open escrow sessions (this node)
                  </Text>
                }
                subtitle={
                  <Text font="title3" mono tabularNumbers>
                    {hubConfig!.settlementEscrowAddress.toLowerCase() ===
                    ZERO_ADDRESS.toLowerCase()
                      ? "Escrow unset (env)"
                      : detail.openSessionCount.toString()}
                  </Text>
                }
              />

              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Active status
                  </Text>
                }
                subtitle={
                  <HStack gap={2} alignItems="center">
                    <Box
                      width={8}
                      height={8}
                      style={{
                        borderRadius: 9999,
                        backgroundColor: detail.info.active
                          ? "#16a34a"
                          : "#dc2626",
                        flexShrink: 0,
                      }}
                    />
                    <Text font="title3">
                      {detail.info.active ? "Active" : "Inactive"}
                    </Text>
                  </HStack>
                }
              />

              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Payout address
                  </Text>
                }
                subtitle={
                  <Text font="title3" mono tabularNumbers>
                    {detail.info.payout}
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
                    {detail.info.feeBps}
                  </Text>
                }
              />

              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    Node base URL
                  </Text>
                }
                subtitle={
                  <Text font="caption" mono tabularNumbers style={{ wordBreak: "break-all" }}>
                    {detail.info.metadataURI || "—"}
                  </Text>
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
                    {detail.info.supportsBestEffort ? "Yes" : "No"}
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
                    {detail.info.supportsTEE ? "Yes" : "No"}
                  </Text>
                }
              />

              <DataCard
                layout="vertical"
                title={
                  <Text font="label2" color="fgMuted">
                    TEE proof status
                  </Text>
                }
                subtitle={
                  <VStack gap={1} alignItems="flex-start">
                    <Text font="title3">
                      {teeProofSubmitted(detail.info.teeReportHash)
                        ? "Submitted"
                        : "Not submitted"}
                    </Text>
                    {teeProofSubmitted(detail.info.teeReportHash) ? (
                      <Text font="caption" mono tabularNumbers color="fgMuted">
                        {detail.info.teeReportHash}
                      </Text>
                    ) : null}
                  </VStack>
                }
              />
            </Box>

            {isOperator &&
            walletClient &&
            publicClient &&
            nodeIdFromRoute &&
            hubConfig ? (
              <NodeOperatorControls
                key={[
                  nodeIdFromRoute,
                  detail.info.metadataURI,
                  detail.info.payout,
                  detail.info.active ? "1" : "0",
                  String(detail.info.lifecycle),
                  detail.openSessionCount.toString(),
                ].join(":")}
                nodeId={nodeIdFromRoute}
                detail={detail as LoadedNodeDetail}
                registryAddress={hubConfig.providerRegistryAddress}
                settlementEscrowAddress={hubConfig.settlementEscrowAddress}
                controlsDisabled={controlsDisabled}
                walletClient={walletClient}
                publicClient={publicClient}
                queryClient={queryClient}
                refetchDetail={refetchDetail}
              />
            ) : null}
          </>
        ) : null}
      </VStack>
    </Box>
  );
}
