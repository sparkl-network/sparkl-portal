"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useCallback, type ReactNode } from "react";
import { getAddress, isAddress, zeroHash, type Address, type Hex, type WalletClient, type PublicClient } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { usePortalPublicClient } from "@/lib/usePortalPublicClient";

import { ZERO_ADDRESS } from "@/lib/chains";
import {
  countOpenEscrowSessionsByModelForNode,
  readOpenSessionCount,
} from "@/lib/evm/escrow";
import { modelNameToId } from "@/lib/evm/modelOracle";
import { formatTxError } from "@/lib/evm/formatTxError";
import { chillNode, getNodeOperator, getNode, lifecycleLabel, markDefunct, setNodeActive, setNodePayout } from "@/lib/evm/registry";
import { peerIdMultihashHex } from "@/lib/nodeId";
import { useResolvedNodeRoute } from "@/lib/useResolvedNodeRoute";
import { FormattedDateTime } from "@/components/FormattedDateTime";
import { OpenSessionModal } from "@/components/sessions/OpenSessionModal";
import { RouterTunnelBadge } from "@/components/router/RouterTunnelBadge";
import { settlementEscrowAbi } from "@/lib/abi";
import { providersForNode } from "@/lib/router/merge";
import { formatCapacityRatio } from "@/lib/router/telemetry";
import {
  useRouterCatalogProviders,
  useRouterNodeStatus,
  useRouterNodesStatus,
} from "@/lib/router/useRouterData";
import { useRouterTelemetry } from "@/lib/router/useRouterTelemetry";
import { routerBaseUrl } from "@/lib/router/activate";
import type { ProviderOffering } from "@/lib/router/types";
import { NodeInfo, NodeLifecycle } from "@/lib/types";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

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

function operatorPageHref(operator: Address): string {
  return `/operator/${encodeURIComponent(getAddress(operator))}`;
}

function NodeDetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[minmax(11rem,14rem)_1fr] sm:gap-x-6 sm:items-start border-b border-border last:border-0 first:pt-0 last:pb-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm min-w-0">{children}</dd>
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${active ? "bg-green-500" : "bg-red-500"}`}
      aria-hidden
    />
  );
}

type LoadedNodeDetail = {
  info: NodeInfo;
  operator: Address;
  isRegistered: true;
  openSessionCount: bigint;
};

function NodeOperatorControls({ nodeId, detail, registryAddress, settlementEscrowAddress, controlsDisabled, walletClient, publicClient, queryClient, refetchDetail }: {
  nodeId: Hex;
  detail: LoadedNodeDetail;
  registryAddress: Address;
  settlementEscrowAddress: Address;
  controlsDisabled: boolean;
  walletClient: WalletClient;
  publicClient: PublicClient;
  queryClient: ReturnType<typeof useQueryClient>;
  refetchDetail: () => Promise<unknown>;
}) {
  const { address: connectedAddress } = useAccount();
  const [newPayoutInput, setNewPayoutInput] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [chillModalOpen, setChillModalOpen] = useState(false);
  const [defunctModalOpen, setDefunctModalOpen] = useState(false);

  const { data: pendingAhead = 0 } = useQuery({
    queryKey: ["walletPendingNonceGap", publicClient?.chain?.id, connectedAddress],
    queryFn: async () => {
      if (!publicClient || !connectedAddress) return 0;
      try {
        const latest = await publicClient.getTransactionCount({ address: connectedAddress, blockTag: "latest" });
        const pending = await publicClient.getTransactionCount({ address: connectedAddress, blockTag: "pending" });
        return Math.max(0, pending - latest);
      } catch {
        return 0;
      }
    },
    enabled: Boolean(publicClient && connectedAddress),
    refetchInterval: 12_000,
  });

  const manageDisabled = controlsDisabled || txBusy;
  const escrowConfigured = settlementEscrowAddress.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
  const canChill = detail.info.lifecycle === NodeLifecycle.Active;
  const canMarkDefunct = detail.info.lifecycle === NodeLifecycle.Chilled && escrowConfigured && detail.openSessionCount === 0n;

  const runTx = useCallback(async (send: () => Promise<`0x${string}`>, onSuccess?: () => void | Promise<void>) => {
    setTxBusy(true);
    setTxError(null);
    setLastTxHash(null);
    try {
      const hash = await send();
      const receipt = await waitForTransactionReceipt(publicClient, { hash });
      if (receipt.status === "reverted") {
        throw new Error("Transaction was mined but reverted on-chain. Compare your wallet network with the hub chain, and confirm you are the operator for this node id.");
      }
      setLastTxHash(hash);
      await queryClient.invalidateQueries({ queryKey: ["nodeDetail"] });
      await queryClient.invalidateQueries({ queryKey: ["allRegistryNodes"] });
      await queryClient.invalidateQueries({ queryKey: ["operatorNodesPage"] });
      await queryClient.invalidateQueries({ queryKey: ["operatorDirectory"] });
      await queryClient.invalidateQueries({ queryKey: ["operatorDetail"] });
      await queryClient.invalidateQueries({ queryKey: ["nodeOpenSessions"] });
      await queryClient.invalidateQueries({ queryKey: ["userSessions"] });
      await refetchDetail();
      await onSuccess?.();
    } catch (e) {
      setTxError(formatTxError(e));
    } finally {
      setTxBusy(false);
    }
  }, [publicClient, queryClient, refetchDetail]);

  async function handleActiveToggle(nextActive: boolean) {
    if (nextActive === detail.info.active) return;
    await runTx(() => setNodeActive(walletClient, registryAddress, nodeId, nextActive));
  }

  async function handlePayoutUpdate() {
    const next = parsePayout(newPayoutInput);
    if (!next || next.toLowerCase() === detail.info.payout.toLowerCase()) return;
    await runTx(() => setNodePayout(walletClient, registryAddress, nodeId, next));
    setNewPayoutInput("");
  }

  async function confirmChill() { setChillModalOpen(false); await runTx(() => chillNode(walletClient, publicClient, registryAddress, nodeId)); }
  async function confirmMarkDefunct() { setDefunctModalOpen(false); await runTx(() => markDefunct(walletClient, publicClient, registryAddress, settlementEscrowAddress, nodeId)); }

  return (
    <div className="space-y-4">
      {/* Pending transactions banner */}
      {pendingAhead > 0 && (
        <Alert variant="warning" className="mb-2">
          <AlertTitle>Pending transactions</AlertTitle>
          <AlertDescription>This wallet has about {pendingAhead} pending transaction{pendingAhead === 1 ? "" : "s"} (nonce ahead of latest confirmed). New transactions can fail or appear stuck until those confirm or are cancelled in your wallet.</AlertDescription>
        </Alert>
      )}

      {/* Chill dialog */}
      <Dialog open={chillModalOpen} onOpenChange={(o) => !o && !txBusy && setChillModalOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Chill this node?</DialogTitle></DialogHeader>
          <DialogDescription className="space-y-2">
            <p>Chilling sets lifecycle to Chilled and clears listing (no new escrow opens for this node id). Existing sessions can still record usage and settle.</p>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">On-chain operator</Label>
              <NextLink href={operatorPageHref(detail.operator)} className="break-all text-xs font-mono underline underline-offset-4 hover:text-accent"><code>{detail.operator}</code></NextLink>
            </div>
            {pendingAhead > 0 && (
              <Alert variant="warning"><AlertTitle>Pending transactions</AlertTitle><AlertDescription>You have pending transactions—consider waiting for them to confirm before chilling.</AlertDescription></Alert>
            )}
          </DialogDescription>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" disabled={txBusy} onClick={() => setChillModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={txBusy} onClick={() => void confirmChill()}>Chill node</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Defunct dialog */}
      <Dialog open={defunctModalOpen} onOpenChange={(o) => !o && !txBusy && setDefunctModalOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Mark node defunct?</DialogTitle></DialogHeader>
          <DialogDescription className="space-y-2">
            <p>This sets lifecycle to Defunct on-chain while keeping operator and metadata for history (no delete). The registry owner can later purge the id if the chain is configured for it.</p>
            {!escrowConfigured && (
              <Alert variant="destructive"><AlertTitle>Escrow address missing</AlertTitle><AlertDescription>Set NEXT_PUBLIC_SETTLEMENT_ESCROW_* in the portal env so the registry can read open session counts.</AlertDescription></Alert>
            )}
            {escrowConfigured && detail.openSessionCount > 0n && (
              <Alert variant="warning"><AlertTitle>Sessions still open</AlertTitle><AlertDescription>Open escrow sessions for this node: {detail.openSessionCount.toString()}. Settle them first.</AlertDescription></Alert>
            )}
          </DialogDescription>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" disabled={txBusy} onClick={() => setDefunctModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={txBusy || !canMarkDefunct} onClick={() => void confirmMarkDefunct()}>Mark defunct</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success/Error banners */}
      {lastTxHash && (
        <Alert variant="default" className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <AlertTitle>Transaction confirmed</AlertTitle>
          <AlertDescription><code>{lastTxHash}</code></AlertDescription>
        </Alert>
      )}

      {txError && (
        <Alert variant="destructive"><AlertTitle>Transaction error</AlertTitle><AlertDescription className="whitespace-pre-wrap">{txError}</AlertDescription></Alert>
      )}

      {/* Controls */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-muted-foreground">Listing status</Label>
        {detail.info.lifecycle !== NodeLifecycle.Active && (
          <p className="text-xs text-muted-foreground">While Chilled or Defunct you cannot toggle listing alone — chill already forces inactive; settling and mark defunct control the rundown.</p>
        )}
        <div className="flex items-center space-x-2">
          <Switch checked={detail.info.active} disabled={manageDisabled || detail.info.lifecycle !== NodeLifecycle.Active} onCheckedChange={(v) => void handleActiveToggle(v)} id="active" />
          <Label htmlFor="active">Active (listed)</Label>
        </div>

        {/* Payout update */}
        <div className="space-y-2 pt-2">
          <Label>Update payout</Label>
          <Input placeholder="0x…" value={newPayoutInput} onChange={(e) => setNewPayoutInput(e.target.value)} disabled={manageDisabled} />
          <Button variant="default" disabled={manageDisabled || !parsePayout(newPayoutInput) || parsePayout(newPayoutInput)?.toLowerCase() === detail.info.payout.toLowerCase()} onClick={() => void handlePayoutUpdate()}>{txBusy ? "Updating..." : "Update payout"}</Button>
        </div>

        {/* Rundown */}
        <div className="space-y-2 pt-4 border-t">
          <Label className="text-sm font-medium text-muted-foreground">Rundown (chill → defunct)</Label>
          <p className="text-xs text-muted-foreground">Lifecycle is {lifecycleLabel(detail.info.lifecycle)}. Escrow sessions still open on this node id: {!escrowConfigured ? "(escrow unset in env — counter reads as 0; register owner must deploy and wire escrow)" : detail.openSessionCount.toString()}</p>
          {detail.info.lifecycle === NodeLifecycle.Defunct && (
            <Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"><AlertTitle>Defunct on-chain</AlertTitle><AlertDescription>The operator record stays for audits. The registry owner may purge the node id separately when the protocol allows it (purgeDefunctNode on the registry contract).</AlertDescription></Alert>
          )}
          <Alert variant="warning"><AlertTitle>Stopping new bookings</AlertTitle><AlertDescription>Chill first (allowed with open sessions), settle everything, then mark defunct when the escrow open-session counter is zero — there is no operator-triggered registry delete anymore.</AlertDescription></Alert>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" disabled={manageDisabled || !canChill || pendingAhead > 0} onClick={() => setChillModalOpen(true)}>{txBusy ? "Processing..." : "Chill node"}</Button>
            <Button variant="destructive" disabled={manageDisabled || detail.info.lifecycle !== NodeLifecycle.Chilled || pendingAhead > 0} onClick={() => setDefunctModalOpen(true)}>{txBusy ? "Processing..." : "Mark defunct…"}</Button>
          </div>
          {!canMarkDefunct && detail.info.lifecycle === NodeLifecycle.Chilled && escrowConfigured && detail.openSessionCount > 0n && (
            <p className="text-xs text-muted-foreground">Mark defunct unlocks automatically when escrow open-session count reaches 0 — use Sessions to settle in-flight ledger rows.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NodeDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const raw = typeof params.nodeId === "string" ? params.nodeId : Array.isArray(params.nodeId) ? params.nodeId[0] : "";
  const [openSessionTarget, setOpenSessionTarget] = useState<ProviderOffering | null>(null);

  const { parsed: parsedRoute, nodeId: nodeIdFromRoute, pathSegmentForLinks } = useResolvedNodeRoute(raw);
  const peerIdDisplay = parsedRoute.peerIdDisplay;

  const multihashHex = useMemo(
    () => (peerIdDisplay && parsedRoute.kind === "peer_id" ? peerIdMultihashHex(peerIdDisplay) : null),
    [peerIdDisplay, parsedRoute.kind],
  );

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { hubConfig, configError } = useHubChainConfig();

  const registryUnset = useMemo(() => { if (!hubConfig?.operatorRegistryAddress) return true; return hubConfig.operatorRegistryAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase(); }, [hubConfig]);

  const publicClient = usePortalPublicClient();
  const { data: walletClient } = useWalletClient({ chainId: hubConfig?.chainId });

  const chainReady = Boolean(
    hubConfig && chainId === hubConfig.chainId && isConnected && address && walletClient && publicClient,
  );
  const detailQueryReady = Boolean(hubConfig && nodeIdFromRoute && !registryUnset && !configError);

  const escrowUnset = useMemo(() => {
    if (!hubConfig?.settlementEscrowAddress) return true;
    return hubConfig.settlementEscrowAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  }, [hubConfig]);

  const { data: dotBalance = 0n } = useQuery({
    queryKey: [
      "nodeOpenSessionBalance",
      hubConfig?.chainId,
      hubConfig?.settlementEscrowAddress,
      address,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig?.settlementEscrowAddress || !address) return 0n;
      const rawBal = await publicClient.readContract({
        address: hubConfig.settlementEscrowAddress,
        abi: settlementEscrowAbi,
        functionName: "getDotBalances",
        args: [address],
      });
      return rawBal as bigint;
    },
    enabled: Boolean(chainReady && !escrowUnset),
  });

  const { data: detail, error: detailError, isLoading: detailLoading, refetch: refetchDetail } = useQuery({
    queryKey: ["nodeDetail", hubConfig?.chainId, hubConfig?.operatorRegistryAddress, nodeIdFromRoute],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !nodeIdFromRoute) throw new Error("Missing RPC client, hub config, or node ID");
      const registry = hubConfig.operatorRegistryAddress;
      const info = await getNode(publicClient, registry, nodeIdFromRoute);
      const operator = await getNodeOperator(publicClient, registry, nodeIdFromRoute);
      const openSessionCount = await readOpenSessionCount(publicClient, hubConfig.settlementEscrowAddress, nodeIdFromRoute);
      return { info, operator, isRegistered: info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase(), openSessionCount };
    },
    enabled: Boolean(detailQueryReady && publicClient),
  });

  const isOperator = Boolean(address && detail?.operator && getAddress(address).toLowerCase() === getAddress(detail.operator).toLowerCase());
  const controlsDisabled = !chainReady || registryUnset || !walletClient || !hubConfig || detailLoading;
  const detailErrMsg = detailError instanceof Error ? detailError.message : "Could not load node";

  const routerConfigured = Boolean(routerBaseUrl());
  const canOpenSessions = Boolean(chainReady && !escrowUnset && routerConfigured);
  const { statusByNodeId } = useRouterNodesStatus();
  const { status: routerStatus, isLoading: routerStatusLoading } = useRouterNodeStatus(
    nodeIdFromRoute,
    statusByNodeId,
  );
  const { data: catalogData } = useRouterCatalogProviders();
  const catalogProviders = catalogData?.data ?? [];
  const telemetry = useRouterTelemetry({
    enabled: routerConfigured,
    initialProviders: catalogProviders,
    initialNodes: undefined,
  });
  const liveProviders = telemetry.providers ?? catalogProviders;
  const nodeProviders = useMemo(
    () => providersForNode(liveProviders, nodeIdFromRoute ?? undefined),
    [liveProviders, nodeIdFromRoute],
  );

  const {
    data: openSessionsByModel,
    isFetching: openSessionsByModelFetching,
  } = useQuery({
    queryKey: [
      "nodeOpenSessionsByModel",
      hubConfig?.chainId,
      hubConfig?.settlementEscrowAddress,
      nodeIdFromRoute,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !nodeIdFromRoute) {
        throw new Error("Missing client, config, or node ID");
      }
      return countOpenEscrowSessionsByModelForNode(
        publicClient,
        hubConfig.settlementEscrowAddress,
        nodeIdFromRoute,
      );
    },
    enabled: Boolean(
      publicClient && hubConfig && nodeIdFromRoute && !escrowUnset && !configError,
    ),
    staleTime: 15_000,
  });

  const listingActiveButTunnelDown = Boolean(
    detail?.isRegistered &&
      detail.info.active &&
      detail.info.lifecycle === NodeLifecycle.Active &&
      routerStatus &&
      routerStatus.status !== "online",
  );

  const displayPeerId = peerIdDisplay;
  const displayMultihash = useMemo(
    () => multihashHex ?? (displayPeerId ? peerIdMultihashHex(displayPeerId) : null),
    [multihashHex, displayPeerId],
  );

  return (
    <div className="px-3 py-3 w-full space-y-4">
      {/* Back link */}
      <NextLink href="/node" className="text-sm text-muted-foreground hover:underline inline-block">← Nodes</NextLink>

      <h1 className="text-2xl font-bold">Node</h1>

      {/* Invalid node ID */}
      {!nodeIdFromRoute && (
        <Alert variant="destructive"><AlertTitle>Invalid node ID</AlertTitle><AlertDescription className="space-y-2">This URL must include a valid node identity: a libp2p peer id (12D3Koo… base58), 0x + 64 hex (bytes32), or an Ethereum address (padded to bytes32 for dev).{address && <NextLink href={`/operator/${encodeURIComponent(getAddress(address))}/node`} className="text-sm font-medium underline">Your operator nodes →</NextLink>}</AlertDescription></Alert>
      )}

      {/* Node identity display */}
      {nodeIdFromRoute && (
        <div className="space-y-1">
          {displayPeerId && (<>
            <Label className="text-sm font-medium text-muted-foreground">Peer ID (libp2p)</Label>
            <code className="break-all text-sm">{displayPeerId}</code>
            {displayMultihash && (<><div className="h-1" /><Label className="text-xs text-muted-foreground">Decoded multihash (hex)</Label><code className="break-all text-xs font-mono text-muted-foreground">{displayMultihash}</code></>)}
          </>)}
          <Label className="text-sm font-medium text-muted-foreground mt-2 block">On-chain node id (bytes32)</Label>
          <code className="break-all text-xs font-mono text-muted-foreground">{nodeIdFromRoute}</code>
        </div>
      )}

      {/* Config errors */}
      {configError && <Alert variant="destructive"><AlertTitle>Configuration error</AlertTitle><AlertDescription>{configError}</AlertDescription></Alert>}
      {hubConfig && registryUnset && !configError && (<Alert variant="destructive"><AlertTitle>Operator registry address missing</AlertTitle><AlertDescription>Set a deployed ProviderRegistry in your env (see .env.example), then restart the dev server.</AlertDescription></Alert>)}
      {isConnected && hubConfig && chainId !== hubConfig.chainId && (<Alert variant="warning"><AlertTitle>Wrong network</AlertTitle><AlertDescription>Switch to chain {hubConfig.chainId} ({hubConfig.chainName}) to load on-chain data.</AlertDescription></Alert>)}
      {!isConnected && (<Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"><AlertTitle>Wallet disconnected</AlertTitle><AlertDescription>You can still view registry data for this node. Connect a wallet on the hub chain to sign updates or switch networks if prompted.</AlertDescription></Alert>)}
      {nodeIdFromRoute && detailQueryReady && detailError && (<Alert variant="destructive"><AlertTitle>Registry read failed</AlertTitle><AlertDescription>{detailErrMsg}</AlertDescription></Alert>)}

      {/* Loading */}
      {nodeIdFromRoute && detailQueryReady && detailLoading && <Skeleton className="h-[300px] w-full" />}

      {/* Not registered */}
      {nodeIdFromRoute && detailQueryReady && detail?.isRegistered === false && !detailLoading && (<Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"><AlertTitle>Not registered</AlertTitle><AlertDescription>There is no ProviderRegistry entry for this node ID.</AlertDescription></Alert>)}

      {/* Registered detail */}
      {nodeIdFromRoute && detailQueryReady && !detailLoading && !detailError && detail?.isRegistered && (<>
        {!isOperator && detail && (<Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"><AlertTitle>Read-only</AlertTitle><AlertDescription>Connect the operator wallet (<NextLink href={operatorPageHref(detail.operator)} className="font-mono underline underline-offset-4 hover:text-accent">{detail.operator}</NextLink>) to change payout or listing status.</AlertDescription></Alert>)}

        {/* Quick links */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary" className="cursor-pointer hover:bg-accent/80"><NextLink href="/node/register" className="text-sm">Register another</NextLink></Badge>
          <span className="text-xs text-muted-foreground self-center">·</span>
          <Badge variant="secondary" className="cursor-pointer hover:bg-accent/80"><NextLink href={`/node/${encodeURIComponent(pathSegmentForLinks)}/session`} className="text-sm">Sessions</NextLink></Badge>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">Node details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <NodeDetailRow label="Moniker">
                {routerStatus?.moniker?.trim() ? (
                  <span>{routerStatus.moniker}</span>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    — Set in sparkl-solo <code className="text-xs font-mono">[node].moniker</code>; shown here when the router tunnel is online.
                  </span>
                )}
              </NodeDetailRow>
              <NodeDetailRow label="Operator">
                <NextLink
                  href={operatorPageHref(detail.operator)}
                  className="break-all font-mono underline underline-offset-4 hover:text-accent transition-colors"
                >
                  <code>{detail.operator}</code>
                </NextLink>
              </NodeDetailRow>
              <NodeDetailRow label="Lifecycle">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      detail.info.lifecycle === NodeLifecycle.Active
                        ? "bg-green-500"
                        : detail.info.lifecycle === NodeLifecycle.Chilled
                          ? "bg-yellow-500"
                          : "bg-gray-400"
                    }`}
                  />
                  <span>{lifecycleLabel(detail.info.lifecycle)}</span>
                </div>
              </NodeDetailRow>
              <NodeDetailRow label="Open escrow sessions (this node)">
                <span className="font-mono tabular-nums">
                  {hubConfig!.settlementEscrowAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase()
                    ? "Escrow unset (env)"
                    : detail.openSessionCount.toString()}
                </span>
              </NodeDetailRow>
              <NodeDetailRow label="Active status">
                <div className="flex items-center gap-2">
                  <StatusDot active={detail.info.active} />
                  <span>{detail.info.active ? "Active" : "Inactive"}</span>
                </div>
              </NodeDetailRow>
              <NodeDetailRow label="Payout address">
                <code className="break-all font-mono text-sm">{detail.info.payout}</code>
              </NodeDetailRow>
              <NodeDetailRow label="Fee (basis points)">
                <span className="font-mono tabular-nums">{detail.info.feeBps}</span>
              </NodeDetailRow>
              <NodeDetailRow label="Supports Best Effort">
                <span>{detail.info.supportsBestEffort ? "Yes" : "No"}</span>
              </NodeDetailRow>
              <NodeDetailRow label="Supports TEE">
                <span>{detail.info.supportsTEE ? "Yes" : "No"}</span>
              </NodeDetailRow>
              <NodeDetailRow label="TEE proof status">
                {teeProofSubmitted(detail.info.teeReportHash) ? (
                  <div className="space-y-1">
                    <span>Submitted</span>
                    <code className="block break-all text-xs font-mono text-muted-foreground">
                      {detail.info.teeReportHash}
                    </code>
                  </div>
                ) : (
                  <span>Not submitted</span>
                )}
              </NodeDetailRow>
            </dl>
          </CardContent>
        </Card>

        {listingActiveButTunnelDown && (
          <Alert variant="warning">
            <AlertTitle>Listed on-chain, tunnel not healthy</AlertTitle>
            <AlertDescription>
              This node is active in ProviderRegistry but the router reports tunnel status &quot;{routerStatus?.status}&quot;.
              Check sparkl-solo is running and connected to the router.
            </AlertDescription>
          </Alert>
        )}

        {routerConfigured && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-base">Router tunnel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <dl>
                <NodeDetailRow label="Tunnel status">
                  {routerStatusLoading && !routerStatus ? (
                    <Skeleton className="h-6 w-24" />
                  ) : (
                    <RouterTunnelBadge status={routerStatus?.status ?? "offline"} detail={routerStatus} />
                  )}
                </NodeDetailRow>
                <NodeDetailRow label="Last pong">
                  <FormattedDateTime
                    value={routerStatus?.last_pong_at}
                    className="text-sm break-all"
                  />
                </NodeDetailRow>
                <NodeDetailRow label="Connected at">
                  <FormattedDateTime
                    value={routerStatus?.connected_at}
                    className="text-sm break-all"
                  />
                </NodeDetailRow>
                <NodeDetailRow label="Uptime">
                  <span className="font-mono tabular-nums">
                    {routerStatus?.uptime_secs != null ? `${routerStatus.uptime_secs}s` : "—"}
                  </span>
                </NodeDetailRow>
                <NodeDetailRow label="In-flight requests">
                  <span className="font-mono tabular-nums">{routerStatus?.in_flight_requests ?? 0}</span>
                </NodeDetailRow>
                <NodeDetailRow label="Models cached">
                  <span className="font-mono tabular-nums">{routerStatus?.model_count ?? 0}</span>
                </NodeDetailRow>
              </dl>

              <div className="border-t border-border pt-4 mt-1">
                <p className="text-sm font-medium text-muted-foreground mb-3">Models on router</p>
                {nodeProviders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No catalog offerings for this node.</p>
                ) : (
                  <div className="relative w-full overflow-auto rounded-lg border">
                    <table className="w-full caption-bottom text-sm">
                      <thead className="[&_tr]:border-b">
                        <tr>
                          <th className="h-10 px-3 text-left font-medium text-muted-foreground">Model</th>
                          <th className="h-10 px-3 text-left font-medium text-muted-foreground">Tunnel</th>
                          <th className="h-10 px-3 text-right font-medium text-muted-foreground">Load</th>
                          <th className="h-10 px-3 text-right font-medium text-muted-foreground" title="Open SettlementEscrow sessions for this node and model">
                            Open sessions
                          </th>
                          <th className="h-10 px-3 text-left font-medium text-muted-foreground">Features</th>
                          <th className="h-10 px-3 text-right font-medium text-muted-foreground">Session</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nodeProviders.map((p) => {
                          const tunnelOnline = p.tunnel_status === "online";
                          const listingOk =
                            detail?.info.active &&
                            detail.info.lifecycle === NodeLifecycle.Active;
                          const openDisabled = !canOpenSessions || !tunnelOnline || !listingOk;
                          const openTitle = !isConnected
                            ? "Connect wallet on hub chain"
                            : !chainReady
                              ? "Switch to hub chain"
                              : escrowUnset
                                ? "Escrow not configured"
                                : !routerConfigured
                                  ? "Router not configured"
                                  : !listingOk
                                    ? "Node not actively listed"
                                    : !tunnelOnline
                                      ? "Tunnel not online"
                                      : "Open escrow session for this model";
                          const modelIdHex = modelNameToId(p.model_id).toLowerCase();
                          const openEscrowCount = openSessionsByModel?.get(modelIdHex) ?? 0;
                          return (
                          <tr key={`${p.model_id}-${p.node_id}`} className="border-b">
                            <td className="p-3 font-mono text-xs break-all">{p.model_id}</td>
                            <td className="p-3">
                              <RouterTunnelBadge status={p.tunnel_status as "online" | "degraded" | "offline"} compact />
                            </td>
                            <td className="p-3 text-right tabular-nums font-mono">
                              {formatCapacityRatio(p.active_requests, p.concurrency)}
                              {p.queued_requests > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400 text-xs ml-1">
                                  +{p.queued_requests}q
                                </span>
                              ) : null}
                            </td>
                            <td className="p-3 text-right tabular-nums font-mono text-xs">
                              {escrowUnset ? (
                                "—"
                              ) : openSessionsByModelFetching && !openSessionsByModel ? (
                                "…"
                              ) : (
                                openEscrowCount
                              )}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {Object.keys(p.features ?? {}).length > 0
                                ? Object.entries(p.features)
                                    .map(([k, v]) => `${k}${v ? `: ${v}` : ""}`)
                                    .join(" · ")
                                : "—"}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={openDisabled}
                                title={openTitle}
                                onClick={() => setOpenSessionTarget(p)}
                              >
                                Open session
                              </Button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Operator controls */}
        {isOperator && walletClient && publicClient && nodeIdFromRoute && hubConfig && (
          <NodeOperatorControls key={[nodeIdFromRoute, detail.info.payout, detail.info.active ? "1" : "0", String(detail.info.lifecycle), detail.openSessionCount.toString()].join(":")} nodeId={nodeIdFromRoute} detail={detail as LoadedNodeDetail} registryAddress={hubConfig.operatorRegistryAddress} settlementEscrowAddress={hubConfig.settlementEscrowAddress} controlsDisabled={controlsDisabled} walletClient={walletClient} publicClient={publicClient} queryClient={queryClient} refetchDetail={refetchDetail} />
        )}

        {openSessionTarget && walletClient && publicClient && nodeIdFromRoute && hubConfig && (
          <OpenSessionModal
            open
            onClose={() => setOpenSessionTarget(null)}
            nodeId={nodeIdFromRoute}
            offering={openSessionTarget}
            nodeInfo={detail.info}
            hubConfig={hubConfig}
            walletClient={walletClient}
            publicClient={publicClient}
            dotBalance={typeof dotBalance === "bigint" ? dotBalance : 0n}
            routerConfigured={routerConfigured}
            onComplete={async () => {
              await queryClient.invalidateQueries({ queryKey: ["userSessions"] });
              await queryClient.invalidateQueries({ queryKey: ["nodeDetail"] });
              await queryClient.invalidateQueries({ queryKey: ["nodeOpenSessions"] });
              await queryClient.invalidateQueries({ queryKey: ["nodeOpenSessionsByModel"] });
            }}
          />
        )}
      </>)}

      {!isConnected && !configError && registryUnset && <Skeleton className="h-[300px] w-full" />}
    </div>
  );
}
