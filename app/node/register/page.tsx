"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, startTransition, useState } from "react";
import { type Address, type Hex, getAddress, isAddress } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import { formatTxError } from "@/lib/evm/formatTxError";
import { getProvider, registerNode } from "@/lib/evm/registry";
import { canonicalNodeIdFromIdentityBody } from "@/lib/identityProbe";
import { parseRegistryCapabilities, type RegistryCapabilities } from "@/lib/registryCapabilities";
import { classifyNodeIdInput, identityInputFromProbe, nodeDetailHrefFromRegistration, type NodeIdInputKind } from "@/lib/nodeId";
import { normalizeNodeBaseUrl } from "@/lib/nodeBaseUrl";
import { registerDebug } from "@/lib/registerDebug";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const supportsTeeEffective = false;

type RegisterFormFields = {
  payoutInput: string;
  supportsBestEffort: boolean;
  supportsTEE: boolean;
  nodeBaseUrl: string;
};

type ProbePart = {
  ok: boolean;
  httpStatus: number;
  body: unknown;
  error?: string;
};

type ProbeApiOk = {
  status: ProbePart;
  models: ProbePart;
  identity: ProbePart;
};

type RegisterProbeGate = {
  canonicalNodeId: Hex | null;
  identityPeerId: string | null;
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
  txBusy: boolean;
  registered: boolean | undefined;
  successHash: string | null;
  canonicalNodeId: Hex | null;
  registrationIdAligned: boolean;
  tiersFromProbe: boolean;
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
  if (params.txBusy) reasons.push("Registration transaction in progress.");
  if (params.registered) reasons.push("This node ID is already registered on-chain.");
  if (params.successHash) reasons.push("Registration already completed for this session.");
  if (!params.canonicalNodeId) reasons.push("Run Probe successfully (GET /identity must return a valid libp2p peer_id).");
  else if (!params.registrationIdAligned) reasons.push("Peer ID or pasted hex must match the last successful Probe (/identity).");
  if (params.canonicalNodeId && !params.tiersFromProbe) reasons.push("Run Probe to load security tiers from the node.");
  else if (params.canonicalNodeId && params.tiersFromProbe && !params.tierBestEffort && !params.tierTee) {
    reasons.push("Enable at least one security tier (Best Effort and/or TEE) from Probe.");
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
          <p>(2) Enter your node&apos;s HTTP base URL and run <strong className="text-foreground">Probe</strong> so the portal can read /status, /v1/models, and /identity.</p>
          <p>(3) Confirm payout and tier settings.</p>
          <p>(4) Sign <strong className="text-foreground">Register</strong> to write your node into <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">OperatorRegistry</code>.</p>
          <p>Registration uses the canonical <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">node_id</code> from /identity (bytes32 = keccak256 of the node&apos;s ed25519 public key). After confirmation, use the node page to change payout, metadata, and listing status.</p>
        </DialogDescription>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatProbeBody(body: unknown): string {
  if (body === null || body === undefined) return "\u2014";
  if (typeof body === "string") return body;
  try { return JSON.stringify(body, null, 2); } catch { return String(body); }
}

function RegisterFormBody({
  nodeIdentityInput, onNodeIdentityChange, nodeIdInputKind, resolvedNodeId, canonicalNodeIdFromProbe, defaultPayoutAddress, payoutInputKey, fieldsDisabled, submitRegisterDisabled, registerDisabledReasons, successHash, txBusy, onSubmitFields, onProbeGateChange, onApplyIdentityFromProbe, onTierFlagsChange,
}: {
  nodeIdentityInput: string; onNodeIdentityChange: (v: string) => void; nodeIdInputKind: NodeIdInputKind; resolvedNodeId: Hex | null; canonicalNodeIdFromProbe: Hex | null; defaultPayoutAddress: string; payoutInputKey: string; fieldsDisabled: boolean; submitRegisterDisabled: boolean; registerDisabledReasons: string[]; successHash: string | null; txBusy: boolean;
  onSubmitFields: (f: RegisterFormFields) => void; onProbeGateChange: (g: RegisterProbeGate) => void; onApplyIdentityFromProbe: (p: string) => void; onTierFlagsChange: (f: { supportsBestEffort: boolean; supportsTEE: boolean; tiersFromProbe: boolean }) => void;
}) {
  const [payoutInput, setPayoutInput] = useState("");
  const [probeTiers, setProbeTiers] = useState<RegistryCapabilities | null>(null);
  const [nodeBaseUrl, setNodeBaseUrl] = useState("http://127.0.0.1:8787");
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeApiOk | null>(null);
  const [probeHttpError, setProbeHttpError] = useState<string | null>(null);

  useEffect(() => { startTransition(() => { setPayoutInput(defaultPayoutAddress); }); }, [defaultPayoutAddress]);
  useEffect(() => {
    if (!probeTiers) { onTierFlagsChange({ supportsBestEffort: false, supportsTEE: false, tiersFromProbe: false }); return; }
    onTierFlagsChange({ supportsBestEffort: probeTiers.supportsBestEffort, supportsTEE: supportsTeeEffective && probeTiers.supportsTEE, tiersFromProbe: true });
  }, [probeTiers]);

  const peerIdReadOnly = Boolean(canonicalNodeIdFromProbe);

  async function runNodeProbe() {
    const base = nodeBaseUrl.trim(); if (!base) return;
    setProbeHttpError(null); setProbeResult(null); onProbeGateChange({ canonicalNodeId: null, identityPeerId: null }); setProbeTiers(null); setProbeLoading(true);
    try {
      const r = await fetch("/api/operator-node-probe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: base }) });
      const data: unknown = await r.json();
      if (!r.ok && data && typeof data === "object" && "error" in data) { setProbeHttpError(typeof (data as { error?: unknown }).error === "string" ? ((data as { error: string }).error) : `Probe failed (${r.status})`); return; }
      if (!r.ok) { setProbeHttpError(`Probe failed (${r.status})`); return; }
      const ok = data as ProbeApiOk; setProbeResult(ok);
      const idPart = ok.identity; const parsed = idPart.ok ? canonicalNodeIdFromIdentityBody(idPart.body) : null;
      onProbeGateChange({ canonicalNodeId: parsed?.nodeId ?? null, identityPeerId: parsed?.peerId ?? null });
      if (parsed?.nodeId) { onApplyIdentityFromProbe(identityInputFromProbe({ canonicalNodeId: parsed.nodeId, identityPeerId: parsed.peerId })); }
      if (idPart.ok) setProbeTiers(parseRegistryCapabilities(idPart.body));
    } catch (e) { setProbeHttpError(e instanceof Error ? e.message : "Probe request failed"); } finally { setProbeLoading(false); }
  }

  return (
    <div className="space-y-4">
      {/* Payout */}
      <div className="space-y-1.5"><Label htmlFor="payoutInput">Payout address (wallet)</Label><Input id="payoutInput" key={payoutInputKey} placeholder="0x\u2026" value={payoutInput} onChange={(e) => setPayoutInput(e.target.value)} disabled={fieldsDisabled} /><p className="text-xs text-muted-foreground">Prefilled from the connected wallet (operator payout).</p></div>

      {/* Base URL */}
      <div className="space-y-1.5"><Label htmlFor="nodeBaseUrl">Node base URL</Label><Input id="nodeBaseUrl" placeholder="http://127.0.0.1:8787" value={nodeBaseUrl} onChange={(e) => { setNodeBaseUrl(e.target.value); onProbeGateChange({ canonicalNodeId: null, identityPeerId: null }); onNodeIdentityChange(""); setProbeTiers(null); setProbeResult(null); setProbeHttpError(null); }} disabled={!successHash} /></div>
      <p className="text-xs text-muted-foreground">HTTP origin stored on-chain as versioned JSON (with baseUrl) in this flow. Your process must serve /status, /identity, and /v1/models.</p>

      {/* Probe */}
      <div className="space-y-2"><Label className="font-medium">Probe node</Label><p className="text-xs text-muted-foreground">Calls GET /status, /v1/models, and /identity on your node via this app (server-side GETs from the portal host). A successful /identity is required before registering.</p>
        <Button variant="secondary" disabled={!successHash || !nodeBaseUrl.trim()} onClick={() => void runNodeProbe()}>{probeLoading ? "Probing..." : "Probe"}</Button>
      </div>

      {probeHttpError && (<Alert variant="destructive"><AlertTitle>Probe error</AlertTitle><AlertDescription>{probeHttpError}</AlertDescription></Alert>)}

      {probeResult && (
        <div className="space-y-3">
          <Label className="font-medium text-sm">Probe results</Label>

          {/* Status */}
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Node status (/status)</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground mb-1">HTTP {probeResult.status.httpStatus} {probeResult.status.ok ? "OK" : "non-OK"}{probeResult.status.error ? ` \u2014 ${probeResult.status.error}` : ""}</p>
            <Textarea readOnly value={formatProbeBody(probeResult.status.body)} className="text-xs font-mono resize-none h-[150px]" /></CardContent></Card>

          {/* Identity */}
          <div className="space-y-2">
            <Label className="font-medium text-sm">Identity (/identity)</Label>
            <div className="flex items-center gap-2"><Checkbox checked={probeTiers?.supportsBestEffort ?? false} onCheckedChange={() => {}} disabled={fieldsDisabled || !probeTiers}/><Label className="text-xs">Supports Best Effort</Label></div>
            <p className="text-xs text-muted-foreground">{probeTiers ? "From Probe (\u0060registry_capabilities\u0060 on GET /identity)." : "Run Probe to load from \u0060registry_capabilities\u0060."}</p>
            {supportsTeeEffective && (<>
              <div className="flex items-center gap-2"><Checkbox checked={probeTiers?.supportsTEE ?? false} onCheckedChange={() => {}} disabled={fieldsDisabled || !probeTiers}/><Label className="text-xs">Supports TEE</Label></div>
              <p className="text-xs text-muted-foreground">{probeTiers ? "From Probe. On-chain TEE sessions still require attestation (\u0060setTEEProof\u0060)." : "Run Probe to load from \u0060registry_capabilities\u0060."}</p>
            </>)}
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground mb-1">HTTP {probeResult.identity.httpStatus} {probeResult.identity.ok ? "OK" : "non-OK"}{probeResult.identity.error ? ` \u2014 ${probeResult.identity.error}` : ""}</p>
              <Textarea readOnly value={formatProbeBody(probeResult.identity.body)} className="text-xs font-mono resize-none h-[150px]" /></CardContent></Card>
          </div>

          {/* Models */}
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Models (/v1/models)</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground mb-1">HTTP {probeResult.models.httpStatus} {probeResult.models.ok ? "OK" : "non-OK"}{probeResult.models.error ? ` \u2014 ${probeResult.models.error}` : ""}</p>
            <Textarea readOnly value={formatProbeBody(probeResult.models.body)} className="text-xs font-mono resize-none h-[200px]" /></CardContent></Card>
        </div>
      )}

      {/* Peer ID */}
      <div className="space-y-1.5"><Label htmlFor="nodeIdentityInput">Peer ID</Label><Input id="nodeIdentityInput" placeholder="Run Probe to load from GET /identity" value={nodeIdentityInput} readOnly={peerIdReadOnly} disabled={fieldsDisabled || !canonicalNodeIdFromProbe} /></div>

      {/* Disabled reasons */}
      {submitRegisterDisabled && registerDisabledReasons.length > 0 && (
        <Alert variant="warning"><AlertTitle>Register is disabled until:</AlertTitle><AlertDescription className="space-y-1 text-xs">{registerDisabledReasons.map((reason, i) => (<span key={`${i}-${reason}`}>\u2022 {reason}</span>))}</AlertDescription></Alert>
      )}

      {/* Register button */}
      <Button type="button" variant="default" disabled={submitRegisterDisabled || Boolean(successHash) || txBusy} onClick={() => { registerDebug("Register on-chain clicked", { submitRegisterDisabled, successHash, fieldsDisabled, peerIdFieldLength: nodeIdentityInput.trim().length, hasResolvedNodeId: Boolean(resolvedNodeId), payoutFieldLength: payoutInput.trim().length, nodeBaseUrlLength: nodeBaseUrl.trim().length, supportsBestEffort: probeTiers?.supportsBestEffort, supportsTEEEffective: supportsTeeEffective && probeTiers?.supportsTEE }); onSubmitFields({ payoutInput, supportsBestEffort: probeTiers?.supportsBestEffort ?? false, supportsTEE: supportsTeeEffective && (probeTiers?.supportsTEE ?? false), nodeBaseUrl }); }}>{txBusy ? "Registering..." : "Register"}</Button>
    </div>
  );
}

export default function ProviderRegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { hubConfig, configError } = useHubChainConfig();
  const publicClient = usePublicClient({ chainId: hubConfig?.chainId });
  const { data: walletClient, error: walletClientError } = useWalletClient({ chainId: hubConfig?.chainId });

  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [successHash, setSuccessHash] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tierFlags, setTierFlags] = useState({ supportsBestEffort: false, supportsTEE: false, tiersFromProbe: false });
  const [nodeIdentityInput, setNodeIdentityInput] = useState("");
  const [probeGate, setProbeGate] = useState<RegisterProbeGate>({ canonicalNodeId: null, identityPeerId: null });

  const { kind: nodeIdInputKind, nodeId: resolvedNodeId } = useMemo(() => classifyNodeIdInput(nodeIdentityInput), [nodeIdentityInput]);
  const registrationLookupId = probeGate.canonicalNodeId ?? (nodeIdInputKind !== "peer_id" ? resolvedNodeId : null);

  const registrationIdAligned = useMemo(() => {
    const c = probeGate.canonicalNodeId; if (!c) return false;
    const hexMatch = Boolean(resolvedNodeId) && resolvedNodeId!.toLowerCase() === c.toLowerCase();
    const peerMatch = probeGate.identityPeerId !== null && nodeIdentityInput.trim() === probeGate.identityPeerId;
    return hexMatch || peerMatch;
  }, [probeGate.canonicalNodeId, probeGate.identityPeerId, resolvedNodeId, nodeIdentityInput]);

  const handleProbeGateChange = useCallback((g: RegisterProbeGate) => { setProbeGate(g); }, []);
  const handleApplyIdentityFromProbe = useCallback((p: string) => { setNodeIdentityInput(p); }, []);
  useEffect(() => { setMounted(true); }, []);
  const effectiveIsConnected = mounted && isConnected;

  const handleTierFlagsChange = useCallback((f: { supportsBestEffort: boolean; supportsTEE: boolean; tiersFromProbe: boolean }) => { setTierFlags(f); }, []);
  const tiersEnabled = tierFlags.tiersFromProbe && (tierFlags.supportsBestEffort || tierFlags.supportsTEE);

  const resolvedNodePageHref = useMemo(() => { const nodeHex = probeGate.canonicalNodeId ?? resolvedNodeId; if (!nodeHex) return "/node"; return nodeDetailHrefFromRegistration({ kind: nodeIdInputKind, nodeIdHex: nodeHex, rawIdentityInput: nodeIdentityInput }); }, [probeGate.canonicalNodeId, resolvedNodeId, nodeIdInputKind, nodeIdentityInput]);

  const chainReady = Boolean(effectiveIsConnected && hubConfig && chainId === hubConfig.chainId && address);
  const registryUnset = useMemo(() => { if (!hubConfig?.operatorRegistryAddress) return true; return hubConfig.operatorRegistryAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase(); }, [hubConfig]);

  const { data: registered, isFetching: registrationLoading } = useQuery({
    queryKey: ["providerRegistered", hubConfig?.chainId, hubConfig?.operatorRegistryAddress, registrationLookupId],
    queryFn: async () => { if (!publicClient || !hubConfig || !registrationLookupId) return false; const info = await getProvider(publicClient, hubConfig.operatorRegistryAddress, registrationLookupId); return info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase(); },
    enabled: Boolean(chainReady && hubConfig && registrationLookupId && publicClient && !registryUnset && !configError),
  });

  function parsePayout(raw: string): Address | null { const s = raw.trim(); if (!s || !isAddress(s)) return null; try { return getAddress(s); } catch { return null; } }

  const submitRegistration = useCallback(async (fields: RegisterFormFields) => {
    setValidationError(null); setTxError(null);
    const nodeId = probeGate.canonicalNodeId; registerDebug("submitRegistration: start", { resolvedNodeId, canonicalNodeId: probeGate.canonicalNodeId, registrationIdAligned, chainReady, isConnected, chainId, hubChainId: hubConfig?.chainId, hasWalletClient: Boolean(walletClient), walletClientError: walletClientError ? walletClientError.message : undefined, hasPublicClient: Boolean(publicClient), registryUnset, registered, registrationLoading, registryAddress: hubConfig?.operatorRegistryAddress });
    if (!nodeId) { setValidationError('Run Probe first. Registration needs a successful GET /identity with a valid libp2p peer_id.'); return; }
    if (!registrationIdAligned) { setValidationError("Peer id or bytes32 field must match your node\u0027s GET /identity. Run Probe again or paste the values from /identity."); return; }
    const payout = parsePayout(fields.payoutInput); if (!payout) { setValidationError("Enter a valid payout address (0x + 40 hex chars)."); return; }
    if (!fields.supportsBestEffort && !fields.supportsTEE) { setValidationError("Enable at least one security tier (Best Effort and/or TEE)."); return; }
    const nodeBaseNormalized = normalizeNodeBaseUrl(fields.nodeBaseUrl); if (!nodeBaseNormalized) { setValidationError("Enter a valid node base URL (http:// or https:// host, optionally with port)."); return; }
    if (!walletClient || !hubConfig || !chainReady || registryUnset || !publicClient) { const missing: string[] = []; if (!walletClient) missing.push("walletClient"); if (!hubConfig) missing.push("hubConfig"); if (!chainReady) missing.push("chainReady (connect + correct network)"); if (registryUnset) missing.push("registry address"); if (!publicClient) missing.push("publicClient (RPC)"); setValidationError(missing.includes("walletClient") ? `Wallet is not ready to sign${walletClientError ? ` (${walletClientError.message})` : ""}. Try reconnecting.` : `Cannot register yet: missing ${missing.join(", ")}. Check banners above or enable NEXT_PUBLIC_DEBUG_REGISTER=1 for console details.`); return; }
    if (registered) { setValidationError("This node ID is already registered. Change the peer id above or open the node page to manage it."); return; }
    const metadataURI = JSON.stringify({ version: 1, baseUrl: nodeBaseNormalized, ...(probeGate.identityPeerId ? { peer_id: probeGate.identityPeerId } : {}) });
    setTxBusy(true); setSuccessHash(null);
    try {
      const hash = await registerNode(walletClient, hubConfig.operatorRegistryAddress, { nodeId, payout, supportsBestEffort: fields.supportsBestEffort, supportsTEE: fields.supportsTEE, metadataURI });
      await waitForTransactionReceipt(publicClient, { hash }); setSuccessHash(hash); registerDebug("submitRegistration: confirmed", { hash });
      await Promise.all(["providerRegistered", "allRegistryNodes", "operatorNodesPage", "nodeDetail"].map(k => queryClient.invalidateQueries({ queryKey: [k] })));
      router.push(nodeDetailHrefFromRegistration({ kind: nodeIdInputKind, nodeIdHex: nodeId, rawIdentityInput: nodeIdentityInput }));
    } catch (e) { registerDebug("submitRegistration: registerNode failed", { error: e instanceof Error ? e.message : String(e) }); setTxError(formatTxError(e)); } finally { setTxBusy(false); }
  }, [chainReady, hubConfig, publicClient, queryClient, registered, registryUnset, resolvedNodeId, nodeIdInputKind, nodeIdentityInput, probeGate, registrationIdAligned, walletClient, walletClientError, router, isConnected, chainId, registrationLoading]);

  const walletRegistryGate = !chainReady || registryUnset || txBusy || !walletClient || !hubConfig;
  const fieldsDisabled = walletRegistryGate || Boolean(registered);
  const submitRegisterDisabled = walletRegistryGate || Boolean(registered) || Boolean(successHash) || !registrationIdAligned || !tiersEnabled;

  const registerDisabledReasons = useMemo(() => { if (!submitRegisterDisabled) return []; return getRegisterDisabledReasons({ configError, hubConfig, isConnected, address, chainId, registryUnset, walletClient, walletClientError: walletClientError ?? null, txBusy, registered, successHash, canonicalNodeId: probeGate.canonicalNodeId, registrationIdAligned, tiersFromProbe: tierFlags.tiersFromProbe, tierBestEffort: tierFlags.supportsBestEffort, tierTee: tierFlags.supportsTEE }); }, [submitRegisterDisabled, configError, hubConfig, isConnected, address, chainId, registryUnset, walletClient, walletClientError, txBusy, registered, successHash, probeGate.canonicalNodeId, registrationIdAligned, tierFlags.tiersFromProbe, tierFlags.supportsBestEffort, tierFlags.supportsTEE]);

  const defaultPayout = effectiveIsConnected && address ? address : "";
  const payoutInputKey = effectiveIsConnected && address ? address : "disconnected";

  return (
    <div className="px-3 py-3 w-full space-y-4">
      {/* Back link */}
      <NextLink href="/node" className="text-sm text-muted-foreground hover:underline inline-block">← Nodes</NextLink>

      {/* Title + help */}
      <div className="flex items-center gap-2"><h1 className="text-2xl font-bold">Register node</h1><Button variant="secondary" size="sm" aria-label="How to register a node" onClick={() => setHelpModalOpen(true)}>?</Button></div>

      <RegisterHelpModal open={helpModalOpen} onClose={() => setHelpModalOpen(false)} />

      {/* Config / network banners */}
      {configError && (<Alert variant="destructive"><AlertTitle>Configuration error</AlertTitle><AlertDescription>{configError}</AlertDescription></Alert>)}
      {hubConfig && registryUnset && !configError && (<Alert variant="destructive"><AlertTitle>Operator registry address missing</AlertTitle><AlertDescription>Deploy OperatorRegistry and set <code>NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_*</code> in .env.local.</AlertDescription></Alert>)}
      {!isConnected && (<Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"><AlertTitle>Wallet disconnected</AlertTitle><AlertDescription>Connect a wallet from the toolbar to register.</AlertDescription></Alert>)}
      {effectiveIsConnected && hubConfig && chainId !== hubConfig.chainId && (<Alert variant="warning"><AlertTitle>Wrong network</AlertTitle><AlertDescription>Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).</AlertDescription></Alert>)}

      {/* Identity mismatch */}
      {!successHash && !registered && !registrationLoading && chainReady && !registryUnset && !configError && probeGate.canonicalNodeId && !registrationIdAligned && (
        <Alert variant="warning"><AlertTitle>Identity must match your node</AlertTitle><AlertDescription>Your peer id or pasted hex does not match the last successful GET /identity probe. Run Probe again, use the peer_id from the response, or paste the node_id hex exactly.</AlertDescription></Alert>
      )}

      {/* Already registered */}
      {chainReady && !registryUnset && !configError && registered && !registrationLoading && (
        <Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"><AlertTitle>This node is already registered</AlertTitle><AlertDescription>This node ID is already on-chain. Use the <NextLink href={resolvedNodePageHref} className="font-medium underline">Node page</NextLink> to manage this ID when your wallet is the operator.</AlertDescription></Alert>
      )}

      {/* Success */}
      {successHash && (
        <Alert variant="default" className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"><AlertTitle>Registration confirmed</AlertTitle><AlertDescription>Transaction hash <code>{successHash}</code>. Redirecting to the node page\u2026</AlertDescription></Alert>
      )}

      {/* Validation error */}
      {validationError && (<Alert variant="destructive"><AlertTitle>Check the form</AlertTitle><AlertDescription>{validationError}</AlertDescription></Alert>)}

      {/* Tx error */}
      {txError && (<Alert variant="destructive"><AlertTitle>Transaction error</AlertTitle><AlertDescription>{txError}</AlertDescription></Alert>)}

      <RegisterFormBody nodeIdentityInput={nodeIdentityInput} onNodeIdentityChange={setNodeIdentityInput} nodeIdInputKind={nodeIdInputKind} resolvedNodeId={resolvedNodeId} canonicalNodeIdFromProbe={probeGate.canonicalNodeId} defaultPayoutAddress={defaultPayout} payoutInputKey={payoutInputKey} fieldsDisabled={fieldsDisabled} submitRegisterDisabled={submitRegisterDisabled} registerDisabledReasons={registerDisabledReasons} successHash={successHash} txBusy={txBusy} onSubmitFields={(f) => void submitRegistration(f)} onProbeGateChange={handleProbeGateChange} onApplyIdentityFromProbe={handleApplyIdentityFromProbe} onTierFlagsChange={handleTierFlagsChange} />
    </div>
  );
}
