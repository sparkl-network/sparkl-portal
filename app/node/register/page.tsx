"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, startTransition, useState } from "react";
import { type Address, type Hex, getAddress, isAddress } from "viem";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { usePortalPublicClient } from "@/lib/usePortalPublicClient";

import { ZERO_ADDRESS, chainRpcUrl } from "@/lib/chains";
import { probeInjectedWalletRpc } from "@/lib/evm/probeWalletRpc";
import { waitForHubTransactionReceipt } from "@/lib/evm/waitForHubTransactionReceipt";
import { formatTxError } from "@/lib/evm/formatTxError";
import { getProvider, registerNode } from "@/lib/evm/registry";
import { buildRegistrationMetadataUri } from "@/lib/registrationMetadata";
import {
  classifyNodeIdInput,
  nodeDetailHrefFromRegistration,
  type NodeIdInputKind,
} from "@/lib/nodeId";
import { registerDebug } from "@/lib/registerDebug";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const supportsTeeEffective = false;
const REGISTER_RECEIPT_TIMEOUT_MS = 120_000;

type RegisterFormFields = {
  payoutInput: string;
  supportsBestEffort: boolean;
  supportsTEE: boolean;
};

function getRegisterDisabledReasons(params: {
  configError: string | null;
  hubConfig: ReturnType<typeof useHubChainConfig>["hubConfig"];
  isConnected: boolean;
  address: string | undefined;
  chainId: number;
  registryUnset: boolean;
  walletClient: ReturnType<typeof useWalletClient>["data"];
  walletClientError: Error | null;
  pendingAhead: number;
  txBusy: boolean;
  registered: boolean | undefined;
  successHash: string | null;
  resolvedNodeId: Hex | null;
  nodeIdInputKind: NodeIdInputKind;
  tierBestEffort: boolean;
  tierTee: boolean;
}): string[] {
  const reasons: string[] = [];
  if (params.configError) reasons.push(params.configError);
  if (!params.hubConfig) reasons.push("Hub chain configuration is not loaded.");
  if (!params.isConnected || !params.address) reasons.push("Connect a wallet from the toolbar.");
  else if (params.hubConfig && params.chainId !== params.hubConfig.chainId) {
    reasons.push(`Switch to ${params.hubConfig.chainName} (chain ${params.hubConfig.chainId}).`);
  }
  if (params.registryUnset) reasons.push("Set OperatorRegistry address in portal env (NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_*).");
  if (params.isConnected && params.hubConfig && params.chainId === params.hubConfig.chainId && !params.walletClient) {
    reasons.push(params.walletClientError ? `Wallet is not ready to sign (${params.walletClientError.message}).` : "Wallet is not ready to sign. Try reconnecting.");
  }
  if (params.pendingAhead > 0) {
    reasons.push(
      `Wallet has about ${params.pendingAhead} pending transaction${params.pendingAhead === 1 ? "" : "s"} (nonce ahead of latest confirmed). Cancel or confirm them in MetaMask before registering.`,
    );
  }
  if (params.txBusy) reasons.push("Registration transaction in progress.");
  if (params.registered) reasons.push("This node ID is already registered on-chain.");
  if (params.successHash) reasons.push("Registration already completed for this session.");
  if (!params.resolvedNodeId) {
    if (params.nodeIdInputKind === "invalid") {
      reasons.push("Enter a valid libp2p peer id (12D3…) or bytes32 node id (0x + 64 hex).");
    } else {
      reasons.push("Enter a node peer id or bytes32 node id.");
    }
  }
  if (params.resolvedNodeId && !params.tierBestEffort && !params.tierTee) {
    reasons.push("Enable at least one security tier (Best Effort and/or TEE).");
  }
  return reasons;
}

function RegisterHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>How to register a node</DialogTitle></DialogHeader>
        <DialogDescription className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>Register your node on the hub chain in four steps:</p>
          <p>(1) Connect your wallet on the correct network.</p>
          <p>(2) Enter the node&apos;s libp2p <strong className="text-foreground">peer id</strong> (from local <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">GET /identity</code> or sparkl-solo startup logs).</p>
          <p>(3) Choose payout and security tiers.</p>
          <p>(4) Sign <strong className="text-foreground">Register</strong> to write your node into <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">OperatorRegistry</code>.</p>
          <p>On-chain <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">node_id</code> is the canonical bytes32 (keccak256 of the libp2p multihash for peer ids). Router tunnel and runtime heartbeats are configured separately in sparkl-solo — the portal does not reach your node.</p>
        </DialogDescription>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegisterFormBody({
  nodeIdentityInput,
  onNodeIdentityChange,
  nodeIdInputKind,
  resolvedNodeId,
  defaultPayoutAddress,
  payoutInputKey,
  fieldsDisabled,
  submitRegisterDisabled,
  registerDisabledReasons,
  successHash,
  txBusy,
  supportsBestEffort,
  supportsTEE,
  onSupportsBestEffortChange,
  onSupportsTEEChange,
  onSubmitFields,
  identityBaseUrl,
  onIdentityBaseUrlChange,
  onFetchIdentity,
  identityFetchBusy,
  identityFetchError,
}: {
  nodeIdentityInput: string;
  onNodeIdentityChange: (v: string) => void;
  nodeIdInputKind: NodeIdInputKind;
  resolvedNodeId: Hex | null;
  defaultPayoutAddress: string;
  payoutInputKey: string;
  fieldsDisabled: boolean;
  submitRegisterDisabled: boolean;
  registerDisabledReasons: string[];
  successHash: string | null;
  txBusy: boolean;
  supportsBestEffort: boolean;
  supportsTEE: boolean;
  onSupportsBestEffortChange: (v: boolean) => void;
  onSupportsTEEChange: (v: boolean) => void;
  onSubmitFields: (f: RegisterFormFields) => void;
  identityBaseUrl: string;
  onIdentityBaseUrlChange: (v: string) => void;
  onFetchIdentity: () => void;
  identityFetchBusy: boolean;
  identityFetchError: string | null;
}) {
  const [payoutInput, setPayoutInput] = useState("");

  useEffect(() => {
    startTransition(() => {
      setPayoutInput(defaultPayoutAddress);
    });
  }, [defaultPayoutAddress]);

  const peerIdInvalid =
    nodeIdentityInput.trim().length > 0 && nodeIdInputKind === "invalid";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="payoutInput">Payout address (wallet)</Label>
        <Input
          id="payoutInput"
          key={payoutInputKey}
          placeholder="0x…"
          value={payoutInput}
          onChange={(e) => setPayoutInput(e.target.value)}
          disabled={fieldsDisabled}
        />
        <p className="text-xs text-muted-foreground">Prefilled from the connected wallet (operator payout).</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nodeIdentityInput">Peer ID</Label>
        <Input
          id="nodeIdentityInput"
          placeholder="12D3Koo… (libp2p peer id) or 0x… (bytes32 node id)"
          value={nodeIdentityInput}
          onChange={(e) => onNodeIdentityChange(e.target.value)}
          disabled={fieldsDisabled || Boolean(successHash)}
        />
        <p className="text-xs text-muted-foreground">
          Copy from your node process. The portal derives the on-chain bytes32 node id from a libp2p peer id string.
        </p>
        {peerIdInvalid && (
          <p className="text-xs text-destructive">Unrecognized format — use a libp2p peer id (12D3…) or 0x + 64 hex chars.</p>
        )}
        {resolvedNodeId && nodeIdInputKind !== "invalid" && (
          <p className="text-xs text-muted-foreground font-mono break-all">
            On-chain node id: {resolvedNodeId}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="identityBaseUrl">Node HTTP URL (optional)</Label>
        <div className="flex gap-2">
          <Input
            id="identityBaseUrl"
            placeholder="http://127.0.0.1:9944"
            value={identityBaseUrl}
            onChange={(e) => onIdentityBaseUrlChange(e.target.value)}
            disabled={fieldsDisabled || Boolean(successHash)}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={fieldsDisabled || identityFetchBusy || !identityBaseUrl.trim()}
            onClick={onFetchIdentity}
          >
            {identityFetchBusy ? "Loading…" : "Fetch /identity"}
          </Button>
        </div>
        {identityFetchError && (
          <p className="text-xs text-destructive">{identityFetchError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Loads peer id from sparkl-solo <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">GET /identity</code>.
          Moniker is configured on the node (<code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">[node].moniker</code>) and shown in the portal when the router tunnel is connected.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="font-medium">Security tiers</Label>
        <div className="flex items-center gap-2">
          <Checkbox
            id="tierBestEffort"
            checked={supportsBestEffort}
            onCheckedChange={(v) => onSupportsBestEffortChange(v === true)}
            disabled={fieldsDisabled || Boolean(successHash)}
          />
          <Label htmlFor="tierBestEffort" className="text-sm">Supports Best Effort</Label>
        </div>
        {supportsTeeEffective && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="tierTee"
              checked={supportsTEE}
              onCheckedChange={(v) => onSupportsTEEChange(v === true)}
              disabled={fieldsDisabled || Boolean(successHash)}
            />
            <Label htmlFor="tierTee" className="text-sm">Supports TEE</Label>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Declared on-chain at registration. Enable at least one tier. TEE sessions still require attestation (<code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">setTEEProof</code>) when enabled.
        </p>
      </div>

      {submitRegisterDisabled && registerDisabledReasons.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Register is disabled until:</AlertTitle>
          <AlertDescription className="space-y-1 text-xs">
            {registerDisabledReasons.map((reason, i) => (
              <span key={`${i}-${reason}`}>• {reason}</span>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        variant="default"
        disabled={submitRegisterDisabled || Boolean(successHash) || txBusy}
        onClick={() => {
          registerDebug("Register on-chain clicked", {
            submitRegisterDisabled,
            successHash,
            fieldsDisabled,
            peerIdFieldLength: nodeIdentityInput.trim().length,
            hasResolvedNodeId: Boolean(resolvedNodeId),
            payoutFieldLength: payoutInput.trim().length,
            supportsBestEffort,
            supportsTEEEffective: supportsTeeEffective && supportsTEE,
          });
          onSubmitFields({
            payoutInput,
            supportsBestEffort,
            supportsTEE: supportsTeeEffective && supportsTEE,
          });
        }}
      >
        {txBusy ? "Registering..." : "Register"}
      </Button>
    </div>
  );
}

export default function ProviderRegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { hubConfig, configError } = useHubChainConfig();
  const publicClient = usePortalPublicClient();
  const { data: walletClient, error: walletClientError } = useWalletClient({ chainId: hubConfig?.chainId });

  const [txBusy, setTxBusy] = useState(false);
  const [txPhase, setTxPhase] = useState<"idle" | "sign" | "confirm">("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [successHash, setSuccessHash] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [nodeIdentityInput, setNodeIdentityInput] = useState("");
  const [identityBaseUrl, setIdentityBaseUrl] = useState("");
  const [identityFetchBusy, setIdentityFetchBusy] = useState(false);
  const [identityFetchError, setIdentityFetchError] = useState<string | null>(null);
  const [supportsBestEffort, setSupportsBestEffort] = useState(true);
  const [supportsTEE, setSupportsTEE] = useState(false);

  const { kind: nodeIdInputKind, nodeId: resolvedNodeId } = useMemo(
    () => classifyNodeIdInput(nodeIdentityInput),
    [nodeIdentityInput],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchIdentity = useCallback(async () => {
    const base = identityBaseUrl.trim().replace(/\/+$/, "");
    if (!base) return;
    setIdentityFetchBusy(true);
    setIdentityFetchError(null);
    try {
      const res = await fetch(`${base}/identity`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        peer_id?: string;
        node_id?: string;
      };
      if (typeof body.peer_id === "string" && body.peer_id.trim()) {
        setNodeIdentityInput(body.peer_id.trim());
      } else if (typeof body.node_id === "string" && body.node_id.trim()) {
        setNodeIdentityInput(body.node_id.trim());
      }
    } catch (e) {
      setIdentityFetchError(e instanceof Error ? e.message : "Failed to fetch /identity");
    } finally {
      setIdentityFetchBusy(false);
    }
  }, [identityBaseUrl]);

  const effectiveIsConnected = mounted && isConnected;
  const tiersEnabled = supportsBestEffort || (supportsTeeEffective && supportsTEE);

  const resolvedNodePageHref = useMemo(() => {
    if (!resolvedNodeId) return "/node";
    return nodeDetailHrefFromRegistration({
      kind: nodeIdInputKind,
      nodeIdHex: resolvedNodeId,
      rawIdentityInput: nodeIdentityInput,
    });
  }, [resolvedNodeId, nodeIdInputKind, nodeIdentityInput]);

  const chainReady = Boolean(effectiveIsConnected && hubConfig && chainId === hubConfig.chainId && address);
  const registryUnset = useMemo(() => {
    if (!hubConfig?.operatorRegistryAddress) return true;
    return hubConfig.operatorRegistryAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  }, [hubConfig]);

  const { data: walletRpcProbe } = useQuery({
    queryKey: [
      "walletRpcProbeRegister",
      hubConfig?.chainId,
      hubConfig?.operatorRegistryAddress,
      address,
      connector?.id,
    ],
    queryFn: async () => {
      if (!hubConfig) return { ok: false as const, message: "Missing hub config" };
      return probeInjectedWalletRpc(hubConfig.chainId, {
        registryAddress: hubConfig.operatorRegistryAddress,
        expectedChainRpcUrl: chainRpcUrl(hubConfig),
        connector,
        connectorName: connector?.name,
      });
    },
    enabled: Boolean(chainReady && hubConfig && !registryUnset && !configError && connector),
    staleTime: 30_000,
  });

  const { data: pendingAhead = 0 } = useQuery({
    queryKey: ["walletPendingNonceGap", publicClient?.chain?.id, address],
    queryFn: async () => {
      if (!publicClient || !address) return 0;
      try {
        const latest = await publicClient.getTransactionCount({
          address,
          blockTag: "latest",
        });
        const pending = await publicClient.getTransactionCount({
          address,
          blockTag: "pending",
        });
        return Math.max(0, pending - latest);
      } catch {
        return 0;
      }
    },
    enabled: Boolean(publicClient && address && chainReady),
    refetchInterval: 12_000,
  });

  const { data: registered, isFetching: registrationLoading } = useQuery({
    queryKey: ["providerRegistered", hubConfig?.chainId, hubConfig?.operatorRegistryAddress, resolvedNodeId],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !resolvedNodeId) return false;
      const info = await getProvider(publicClient, hubConfig.operatorRegistryAddress, resolvedNodeId);
      return info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
    },
    enabled: Boolean(chainReady && hubConfig && resolvedNodeId && publicClient && !registryUnset && !configError),
  });

  function parsePayout(raw: string): Address | null {
    const s = raw.trim();
    if (!s || !isAddress(s)) return null;
    try {
      return getAddress(s);
    } catch {
      return null;
    }
  }

  const submitRegistration = useCallback(
    async (fields: RegisterFormFields) => {
      setValidationError(null);
      setTxError(null);
      const nodeId = resolvedNodeId;
      registerDebug("submitRegistration: start", {
        resolvedNodeId,
        chainReady,
        isConnected,
        chainId,
        hubChainId: hubConfig?.chainId,
        hasWalletClient: Boolean(walletClient),
        walletClientError: walletClientError ? walletClientError.message : undefined,
        hasPublicClient: Boolean(publicClient),
        registryUnset,
        registered,
        registryAddress: hubConfig?.operatorRegistryAddress,
      });
      if (!nodeId) {
        setValidationError("Enter a valid libp2p peer id (12D3…) or bytes32 node id (0x + 64 hex).");
        return;
      }
      const payout = parsePayout(fields.payoutInput);
      if (!payout) {
        setValidationError("Enter a valid payout address (0x + 40 hex chars).");
        return;
      }
      if (!fields.supportsBestEffort && !fields.supportsTEE) {
        setValidationError("Enable at least one security tier (Best Effort and/or TEE).");
        return;
      }
      if (!walletClient || !hubConfig || !chainReady || registryUnset || !publicClient) {
        const missing: string[] = [];
        if (!walletClient) missing.push("walletClient");
        if (!hubConfig) missing.push("hubConfig");
        if (!chainReady) missing.push("chainReady (connect + correct network)");
        if (registryUnset) missing.push("registry address");
        if (!publicClient) missing.push("publicClient (RPC)");
        setValidationError(
          missing.includes("walletClient")
            ? `Wallet is not ready to sign${walletClientError ? ` (${walletClientError.message})` : ""}. Try reconnecting.`
            : `Cannot register yet: missing ${missing.join(", ")}. Check banners above or enable NEXT_PUBLIC_DEBUG_REGISTER=1 for console details.`,
        );
        return;
      }
      if (registered) {
        setValidationError("This node ID is already registered. Change the peer id above or open the node page to manage it.");
        return;
      }
      if (walletRpcProbe && !walletRpcProbe.ok) {
        setTxError(walletRpcProbe.message);
        return;
      }

      setTxBusy(true);
      setTxPhase("sign");
      setSuccessHash(null);
      try {
        registerDebug("submitRegistration: awaiting wallet signature (check SubWallet popup)");
        const hash = await registerNode(
          walletClient,
          publicClient,
          hubConfig.operatorRegistryAddress,
          {
            nodeId,
            payout,
            supportsBestEffort: fields.supportsBestEffort,
            supportsTEE: fields.supportsTEE,
            metadataURI: buildRegistrationMetadataUri({
              peerId: nodeIdInputKind === "peer_id" ? nodeIdentityInput.trim() : "",
              nodeId,
            }),
          },
        );
        registerDebug("submitRegistration: submitted", { hash });
        setTxPhase("confirm");
        const receipt = await waitForHubTransactionReceipt(
          publicClient,
          hubConfig,
          hash,
          REGISTER_RECEIPT_TIMEOUT_MS,
        );
        if (receipt.status === "reverted") {
          throw new Error(
            "Transaction was mined but reverted on-chain. Confirm MetaMask uses the same RPC as NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB and contract addresses match contracts/deployments/local.json.",
          );
        }
        setSuccessHash(hash);
        registerDebug("submitRegistration: confirmed", { hash, status: receipt.status });
        await Promise.all(
          ["providerRegistered", "allRegistryNodes", "operatorNodesPage", "nodeDetail"].map((k) =>
            queryClient.invalidateQueries({ queryKey: [k] }),
          ),
        );
        router.push(
          nodeDetailHrefFromRegistration({
            kind: nodeIdInputKind,
            nodeIdHex: nodeId,
            rawIdentityInput: nodeIdentityInput,
          }),
        );
      } catch (e) {
        registerDebug("submitRegistration: registerNode failed", {
          error: e instanceof Error ? e.message : String(e),
        });
        setTxError(formatTxError(e));
      } finally {
        setTxBusy(false);
        setTxPhase("idle");
      }
    },
    [
      chainReady,
      hubConfig,
      publicClient,
      queryClient,
      registered,
      registryUnset,
      resolvedNodeId,
      nodeIdInputKind,
      nodeIdentityInput,
      walletClient,
      walletClientError,
      router,
      isConnected,
      chainId,
    ],
  );

  const walletRegistryGate =
    !chainReady || registryUnset || txBusy || !walletClient || !hubConfig || pendingAhead > 0;
  const fieldsDisabled = walletRegistryGate || Boolean(registered);
  const submitRegisterDisabled =
    walletRegistryGate || Boolean(registered) || Boolean(successHash) || !resolvedNodeId || !tiersEnabled;

  const registerDisabledReasons = useMemo(() => {
    if (!submitRegisterDisabled) return [];
    return getRegisterDisabledReasons({
      configError,
      hubConfig,
      isConnected,
      address,
      chainId,
      registryUnset,
      walletClient,
      walletClientError: walletClientError ?? null,
      pendingAhead,
      txBusy,
      registered,
      successHash,
      resolvedNodeId,
      nodeIdInputKind,
      tierBestEffort: supportsBestEffort,
      tierTee: supportsTEE,
    });
  }, [
    submitRegisterDisabled,
    configError,
    hubConfig,
    isConnected,
    address,
    chainId,
    registryUnset,
    walletClient,
    walletClientError,
    pendingAhead,
    txBusy,
    registered,
    successHash,
    resolvedNodeId,
    nodeIdInputKind,
    supportsBestEffort,
    supportsTEE,
  ]);

  const defaultPayout = effectiveIsConnected && address ? address : "";
  const payoutInputKey = effectiveIsConnected && address ? address : "disconnected";

  return (
    <div className="px-3 py-3 w-full space-y-4">
      <NextLink href="/node" className="text-sm text-muted-foreground hover:underline inline-block">
        ← Nodes
      </NextLink>

      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">Register node</h1>
        <Button variant="secondary" size="sm" aria-label="How to register a node" onClick={() => setHelpModalOpen(true)}>
          ?
        </Button>
      </div>

      <RegisterHelpModal open={helpModalOpen} onClose={() => setHelpModalOpen(false)} />

      {configError && (
        <Alert variant="destructive">
          <AlertTitle>Configuration error</AlertTitle>
          <AlertDescription>{configError}</AlertDescription>
        </Alert>
      )}
      {hubConfig && registryUnset && !configError && (
        <Alert variant="destructive">
          <AlertTitle>Operator registry address missing</AlertTitle>
          <AlertDescription>
            Deploy OperatorRegistry and set <code>NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_*</code> in .env.local.
          </AlertDescription>
        </Alert>
      )}
      {!isConnected && (
        <Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <AlertTitle>Wallet disconnected</AlertTitle>
          <AlertDescription>Connect a wallet from the toolbar to register.</AlertDescription>
        </Alert>
      )}
      {effectiveIsConnected && hubConfig && chainId !== hubConfig.chainId && (
        <Alert variant="warning">
          <AlertTitle>Wrong network</AlertTitle>
          <AlertDescription>
            Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).
          </AlertDescription>
        </Alert>
      )}
      {chainReady && walletRpcProbe && !walletRpcProbe.ok && (
        <Alert variant="warning">
          <AlertTitle>Wallet RPC mismatch</AlertTitle>
          <AlertDescription>{walletRpcProbe.message}</AlertDescription>
        </Alert>
      )}
      {chainReady && txBusy && (
        <Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <AlertTitle>
            {txPhase === "sign" ? "Approve in SubWallet" : "Confirming on-chain"}
          </AlertTitle>
          <AlertDescription>
            {txPhase === "sign"
              ? "No portal error yet — open the SubWallet extension and approve the registerNode transaction. If nothing appears, check the wallet RPC banner above."
              : "Transaction submitted; waiting for Anvil to include it (portal RPC). This step fails fast if SubWallet broadcast to a different RPC than http://127.0.0.1:8545."}
          </AlertDescription>
        </Alert>
      )}
      {chainReady && pendingAhead > 0 && (
        <Alert variant="warning">
          <AlertTitle>Pending wallet transactions</AlertTitle>
          <AlertDescription>
            This wallet has about {pendingAhead} pending transaction{pendingAhead === 1 ? "" : "s"} (nonce ahead of
            latest confirmed). Registration can hang until those confirm or are dropped in your wallet history.
            For a clean local Anvil: clear the account&apos;s activity data for chain {hubConfig?.chainId}, or reset
            Anvil state and redeploy with <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">./scripts/deploy-local-sync-env.sh --reset-chain --start-anvil</code>.
          </AlertDescription>
        </Alert>
      )}

      {chainReady && !registryUnset && !configError && registered && !registrationLoading && (
        <Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <AlertTitle>This node is already registered</AlertTitle>
          <AlertDescription>
            This node ID is already on-chain. Use the{" "}
            <NextLink href={resolvedNodePageHref} className="font-medium underline">
              Node page
            </NextLink>{" "}
            to manage this ID when your wallet is the operator.
          </AlertDescription>
        </Alert>
      )}

      {successHash && (
        <Alert variant="default" className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <AlertTitle>Registration confirmed</AlertTitle>
          <AlertDescription>
            Transaction hash <code>{successHash}</code>. Redirecting to the node page…
          </AlertDescription>
        </Alert>
      )}

      {validationError && (
        <Alert variant="destructive">
          <AlertTitle>Check the form</AlertTitle>
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      {txError && (
        <Alert variant="destructive">
          <AlertTitle>Transaction error</AlertTitle>
          <AlertDescription>{txError}</AlertDescription>
        </Alert>
      )}

      <RegisterFormBody
        nodeIdentityInput={nodeIdentityInput}
        onNodeIdentityChange={setNodeIdentityInput}
        nodeIdInputKind={nodeIdInputKind}
        resolvedNodeId={resolvedNodeId}
        defaultPayoutAddress={defaultPayout}
        payoutInputKey={payoutInputKey}
        fieldsDisabled={fieldsDisabled}
        submitRegisterDisabled={submitRegisterDisabled}
        registerDisabledReasons={registerDisabledReasons}
        successHash={successHash}
        txBusy={txBusy}
        supportsBestEffort={supportsBestEffort}
        supportsTEE={supportsTEE}
        onSupportsBestEffortChange={setSupportsBestEffort}
        onSupportsTEEChange={setSupportsTEE}
        onSubmitFields={(f) => void submitRegistration(f)}
        identityBaseUrl={identityBaseUrl}
        onIdentityBaseUrlChange={setIdentityBaseUrl}
        onFetchIdentity={() => void fetchIdentity()}
        identityFetchBusy={identityFetchBusy}
        identityFetchError={identityFetchError}
      />
    </div>
  );
}
