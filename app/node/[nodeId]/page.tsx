"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, useCallback } from "react";
import { getAddress, isAddress, zeroHash, type Address, type Hex, type WalletClient, type PublicClient } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import { readOpenSessionCount } from "@/lib/evm/escrow";
import { formatTxError } from "@/lib/evm/formatTxError";
import { chillNode, getNodeOperator, getNode, lifecycleLabel, markDefunct, setNodeActive, setNodeMetadata, setNodePayout } from "@/lib/evm/registry";
import { peerIdMultihashHex } from "@/lib/nodeId";
import { useResolvedNodeRoute } from "@/lib/useResolvedNodeRoute";
import { metadataUriToBaseUrl, normalizeNodeBaseUrl } from "@/lib/nodeBaseUrl";
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
  const [newBaseUrlInput, setNewBaseUrlInput] = useState(() => metadataUriToBaseUrl(detail.info.metadataURI ?? "") ?? detail.info.metadataURI ?? "");
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

  const baseUrlSaveDisabled = useMemo(() => {
    const next = normalizeNodeBaseUrl(newBaseUrlInput.trim());
    const currentRaw = detail.info.metadataURI ?? "";
    const current = metadataUriToBaseUrl(currentRaw) ?? normalizeNodeBaseUrl(currentRaw);
    if (!next) return true;
    if (current && next === current) return true;
    return false;
  }, [newBaseUrlInput, detail.info.metadataURI]);

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

  async function handleBaseUrlUpdate() {
    const base = normalizeNodeBaseUrl(newBaseUrlInput);
    if (!base) {
      setTxError("Enter a valid http(s) node base URL (host, optional port — used for /status, /identity, /v1/models).");
      return;
    }
    const currentRaw = detail.info.metadataURI ?? "";
    const currentBase = metadataUriToBaseUrl(currentRaw) ?? normalizeNodeBaseUrl(currentRaw);
    if (currentBase && base === currentBase) return;
    setTxError(null);
    await runTx(() => setNodeMetadata(walletClient, registryAddress, nodeId, base));
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
      <Dialog open={chillModalOpen} onOpenChange={(o) => !o && (txBusy || closeChillModal())}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Chill this node?</DialogTitle></DialogHeader>
          <DialogDescription className="space-y-2">
            <p>Chilling sets lifecycle to Chilled and clears listing (no new escrow opens for this node id). Existing sessions can still record usage and settle.</p>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">On-chain operator</Label>
              <code className="break-all text-xs font-mono">{detail.operator}</code>
            </div>
            {pendingAhead > 0 && (
              <Alert variant="warning"><AlertTitle>Pending transactions</AlertTitle><AlertDescription>You have pending transactions—consider waiting for them to confirm before chilling.</AlertDescription></Alert>
            )}
          </DialogDescription>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" disabled={txBusy} onClick={closeChillModal}>Cancel</Button>
            <Button variant="destructive" disabled={txBusy} onClick={() => void confirmChill()}>Chill node</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Defunct dialog */}
      <Dialog open={defunctModalOpen} onOpenChange={(o) => !o && (txBusy || closeDefunctModal())}>
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
            <Button variant="secondary" disabled={txBusy} onClick={closeDefunctModal}>Cancel</Button>
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

        {/* Base URL update */}
        <div className="space-y-2 pt-2">
          <Label>Node base URL</Label>
          <p className="text-xs text-muted-foreground">HTTP(S) origin (or JSON metadata with baseUrl) stored on-chain; your process should serve /status, /identity, /v1/models.</p>
          <Input placeholder="https://node.example.com:8787" value={newBaseUrlInput} onChange={(e) => setNewBaseUrlInput(e.target.value)} disabled={manageDisabled} />
          <Button variant="default" disabled={manageDisabled || baseUrlSaveDisabled} onClick={() => void handleBaseUrlUpdate()}>{txBusy ? "Updating..." : "Update base URL"}</Button>
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

function closeChillModal() { /* outer scope */ }
function closeDefunctModal() { /* outer scope */ }

export default function NodeDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const raw = typeof params.nodeId === "string" ? params.nodeId : Array.isArray(params.nodeId) ? params.nodeId[0] : "";

  const { parsed: parsedRoute, nodeId: nodeIdFromRoute, pathSegmentForLinks } = useResolvedNodeRoute(raw);
  const peerIdDisplay = parsedRoute.peerIdDisplay;

  const multihashHex = useMemo(() => peerIdDisplay && parsedRoute.kind === "peer_id" ? peerIdMultihashHex(peerIdDisplay) : null, [peerIdDisplay, parsedRoute.kind]);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { hubConfig, configError } = useHubChainConfig();

  const registryUnset = useMemo(() => { if (!hubConfig?.operatorRegistryAddress) return true; return hubConfig.operatorRegistryAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase(); }, [hubConfig]);

  const publicClient = usePublicClient({ chainId: hubConfig?.chainId });
  const { data: walletClient } = useWalletClient({ chainId: hubConfig?.chainId });

  const chainReady = Boolean(hubConfig && chainId === hubConfig.chainId && isConnected);
  const detailQueryReady = Boolean(hubConfig && nodeIdFromRoute && !registryUnset && !configError);

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
          {peerIdDisplay && (<>
            <Label className="text-sm font-medium text-muted-foreground">Peer ID (libp2p)</Label>
            <code className="break-all text-sm">{peerIdDisplay}</code>
            {multihashHex && (<><div className="h-1" /><Label className="text-xs text-muted-foreground">Decoded multihash (hex)</Label><code className="break-all text-xs font-mono text-muted-foreground">{multihashHex}</code></>)}
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
        {!isOperator && detail && (<Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"><AlertTitle>Read-only</AlertTitle><AlertDescription>Connect the operator wallet ({detail.operator}) to change payout, node base URL, or listing status.</AlertDescription></Alert>)}

        {/* Quick links */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary" className="cursor-pointer hover:bg-accent/80"><NextLink href="/node/register" className="text-sm">Register another</NextLink></Badge>
          <span className="text-xs text-muted-foreground self-center">·</span>
          <Badge variant="secondary" className="cursor-pointer hover:bg-accent/80"><NextLink href={`/node/${encodeURIComponent(pathSegmentForLinks)}/sessions`} className="text-sm">Sessions</NextLink></Badge>
        </div>

        {/* Data cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Operator</CardTitle></CardHeader><CardContent><code className="break-all text-sm">{detail.operator}</code></CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Lifecycle</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full flex-shrink-0 ${detail.info.lifecycle === NodeLifecycle.Active ? "bg-green-500" : detail.info.lifecycle === NodeLifecycle.Chilled ? "bg-yellow-500" : "bg-gray-400"}`} /><span>{lifecycleLabel(detail.info.lifecycle)}</span></div></CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Open escrow sessions (this node)</CardTitle></CardHeader><CardContent><code className="break-all text-sm">{hubConfig!.settlementEscrowAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? "Escrow unset (env)" : detail.openSessionCount.toString()}</code></CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Active status</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full flex-shrink-0 ${detail.info.active ? "bg-green-500" : "bg-red-500"}`} /><span>{detail.info.active ? "Active" : "Inactive"}</span></div></CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Payout address</CardTitle></CardHeader><CardContent><code className="break-all text-sm">{detail.info.payout}</code></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Fee (basis points)</CardTitle></CardHeader><CardContent><code>{detail.info.feeBps}</code></CardContent></Card>

          <Card className="sm:col-span-2 lg:col-span-1"><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Node base URL</CardTitle></CardHeader><CardContent><code className="break-all text-xs">{detail.info.metadataURI || "—"}</code></CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Supports Best Effort</CardTitle></CardHeader><CardContent><span>{detail.info.supportsBestEffort ? "Yes" : "No"}</span></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Supports TEE</CardTitle></CardHeader><CardContent><span>{detail.info.supportsTEE ? "Yes" : "No"}</span></CardContent></Card>

          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">TEE proof status</CardTitle></CardHeader><CardContent className="space-y-1">{teeProofSubmitted(detail.info.teeReportHash) ? (<><span>{teeProofSubmitted(detail.info.teeReportHash) ? "Submitted" : "Not submitted"}</span><code className="break-all text-xs font-mono text-muted-foreground">{detail.info.teeReportHash}</code></>) : <span>Not submitted</span>}</CardContent></Card>
        </div>

        {/* Operator controls */}
        {isOperator && walletClient && publicClient && nodeIdFromRoute && hubConfig && (
          <NodeOperatorControls key={[nodeIdFromRoute, detail.info.metadataURI, detail.info.payout, detail.info.active ? "1" : "0", String(detail.info.lifecycle), detail.openSessionCount.toString()].join(":")} nodeId={nodeIdFromRoute} detail={detail as LoadedNodeDetail} registryAddress={hubConfig.operatorRegistryAddress} settlementEscrowAddress={hubConfig.settlementEscrowAddress} controlsDisabled={controlsDisabled} walletClient={walletClient} publicClient={publicClient} queryClient={queryClient} refetchDetail={refetchDetail} />
        )}
      </>)}

      {!isConnected && !configError && registryUnset && <Skeleton className="h-[300px] w-full" />}
    </div>
  );
}
