"use client";

import NextLink from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import type { Hex, PublicClient, WalletClient } from "viem";
import { useAccount } from "wagmi";

import type { HubChainConfig } from "@/lib/chains";

import { ApiKeyRevealModal } from "@/components/sessions/ApiKeyRevealModal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MAX_SESSION_NAME_CHARS,
  normalizeSessionName,
  openSession,
  parseSessionIdFromReceipt,
  type OpenSessionMode,
} from "@/lib/evm/escrow";
import { formatTxError } from "@/lib/evm/formatTxError";
import {
  formatRateTooStaleHelp,
  readRateOracleStatus,
} from "@/lib/evm/rateOracle";
import { modelNameToId } from "@/lib/evm/modelOracle";
import { activateSessionViaPortal } from "@/lib/router/activateClient";
import { NodeLifecycle, SecurityTier, type NodeInfo } from "@/lib/types";
import { formatCapacityRatio } from "@/lib/router/telemetry";
import type { ProviderOffering } from "@/lib/router/types";

type Props = {
  open: boolean;
  onClose: () => void;
  nodeId: Hex;
  offering: ProviderOffering;
  nodeInfo: NodeInfo;
  hubConfig: HubChainConfig;
  walletClient: WalletClient;
  publicClient: PublicClient;
  dotBalance: bigint;
  routerConfigured: boolean;
  onComplete?: () => void;
};

function ContractAddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-x-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <code className="break-all text-[11px] leading-snug">{address}</code>
    </div>
  );
}

const TIER_TABS = [
  { id: "best" as const, label: "Best effort" },
  { id: "tee" as const, label: "TEE verified" },
];

const MODE_TABS = [
  { id: "dotBalance" as const, label: "Internal balance" },
  { id: "native" as const, label: "Native deposit" },
];

function fieldFromWei(v: bigint): string {
  return formatUnits(v, 18);
}

function parseField(raw: string): bigint | null {
  try {
    const t = raw.trim();
    if (!t) return null;
    return parseUnits(t, 18);
  } catch {
    return null;
  }
}

function defaultLockAmount(dotBalance: bigint): string {
  if (dotBalance > 0n) return fieldFromWei(dotBalance);
  return "1";
}

function OpenSessionForm({
  onClose,
  nodeId,
  offering,
  nodeInfo,
  hubConfig,
  walletClient,
  publicClient,
  dotBalance,
  routerConfigured,
  onComplete,
}: Omit<Props, "open">) {
  const escrowAddress = hubConfig.settlementEscrowAddress;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockAmount, setLockAmount] = useState(() => defaultLockAmount(dotBalance));
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [tierTab, setTierTab] = useState<(typeof TIER_TABS)[number]>(() => {
    if (nodeInfo.supportsTEE && !nodeInfo.supportsBestEffort) return TIER_TABS[1];
    return TIER_TABS[0];
  });
  const [modeTab, setModeTab] = useState<(typeof MODE_TABS)[number]>(() =>
    dotBalance > 0n ? MODE_TABS[0] : MODE_TABS[1],
  );
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<bigint | null>(null);
  const [openedSessionId, setOpenedSessionId] = useState<bigint | null>(null);
  const [activateOnly, setActivateOnly] = useState(false);
  const { connector } = useAccount();

  const tierOptions = useMemo(() => {
    const out: typeof TIER_TABS = [];
    if (nodeInfo.supportsBestEffort) out.push(TIER_TABS[0]);
    if (nodeInfo.supportsTEE) out.push(TIER_TABS[1]);
    return out.length > 0 ? out : TIER_TABS;
  }, [nodeInfo.supportsBestEffort, nodeInfo.supportsTEE]);

  const listingOk =
    nodeInfo.active && nodeInfo.lifecycle === NodeLifecycle.Active;
  const tunnelOk = offering.tunnel_status === "online";

  const modelIdBytes = useMemo(
    () => modelNameToId(offering.model_id),
    [offering.model_id],
  );

  const { data: rateOracleStatus } = useQuery({
    queryKey: ["rateOracleStatus", hubConfig.chainId, escrowAddress],
    queryFn: () => readRateOracleStatus(publicClient, escrowAddress),
    enabled: escrowAddress.toLowerCase() !== zeroAddress.toLowerCase(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const rateOracleStale = rateOracleStatus?.fresh === false;

  const { data: escrowHasCode } = useQuery({
    queryKey: [
      "escrowBytecode",
      hubConfig.chainId,
      escrowAddress,
    ],
    queryFn: async () => {
      const code = await publicClient.getBytecode({ address: escrowAddress });
      return Boolean(code && code !== "0x");
    },
    enabled:
      escrowAddress.toLowerCase() !== zeroAddress.toLowerCase(),
  });

  async function runActivateOnly(sid: bigint) {
    setBusy(true);
    setError(null);
    try {
      const res = await activateSessionViaPortal({
        walletClient,
        publicClient,
        sessionId: sid,
        connector,
      });
      setApiKey(res.apiKey);
      setSessionId(sid);
      setOpenedSessionId(null);
      setActivateOnly(false);
      await onComplete?.();
    } catch (e) {
      setError(formatTxError(e));
    } finally {
      setBusy(false);
    }
  }

  async function runOpenAndActivate() {
    setError(null);
    setOpenedSessionId(null);
    setActivateOnly(false);

    if (!listingOk) {
      setError("Node is not active and listed on-chain. Cannot open a new session.");
      return;
    }
    if (!tunnelOk) {
      setError("Router tunnel is not online for this model. Check sparkl-solo and router connection.");
      return;
    }
    if (!routerConfigured) {
      setError("Router URL is not configured on the portal (NEXT_PUBLIC_SPARKL_ROUTER_URL / SPARKL_ROUTER_URL).");
      return;
    }
    if (rateOracleStale) {
      setError(formatRateTooStaleHelp(hubConfig.chainEnv));
      return;
    }

    let sessionName = "";
    try {
      sessionName = normalizeSessionName(sessionNameInput);
      setNameError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setNameError(msg);
      setError(msg);
      return;
    }

    const amount = parseField(lockAmount);
    if (amount === null || amount <= 0n) {
      setError("Enter a positive lock amount.");
      return;
    }
    const mode: OpenSessionMode = modeTab.id;
    if (mode === "dotBalance" && amount > dotBalance) {
      setError("Lock amount exceeds internal balance. Fund via /user or use native deposit.");
      return;
    }

    const tier =
      tierTab.id === "tee" ? SecurityTier.TEE_VERIFIED : SecurityTier.BEST_EFFORT;

    setBusy(true);
    let sid: bigint | null = null;
    try {
      const hash = await openSession(
        walletClient,
        publicClient,
        escrowAddress,
        nodeId,
        tier,
        modelIdBytes,
        amount,
        sessionName,
        mode,
        hubConfig.nativeCurrency.decimals,
        connector,
      );
      const receipt = await waitForTransactionReceipt(publicClient, { hash });
      sid = parseSessionIdFromReceipt(receipt);
      if (sid === null) {
        setError("Could not read session id from receipt.");
        return;
      }
      setSessionId(sid);
      setOpenedSessionId(sid);
      await onComplete?.();

      try {
        const res = await activateSessionViaPortal({
          walletClient,
          publicClient,
          sessionId: sid,
          connector,
        });
        setApiKey(res.apiKey);
        setOpenedSessionId(null);
      } catch (activateErr) {
        setActivateOnly(true);
        setError(
          `Session ${sid.toString()} was opened on-chain (funds locked), but router activation failed.\n\n${formatTxError(activateErr)}\n\nUse "Activate session" below or open My sessions and click "Show API key again".`,
        );
      }
    } catch (e) {
      if (sid !== null) {
        setOpenedSessionId(sid);
        setActivateOnly(true);
        setError(
          `Session ${sid.toString()} may have been created on-chain. Check My sessions before opening another.\n\n${formatTxError(e)}`,
        );
        await onComplete?.();
      } else {
        setError(formatTxError(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={!apiKey} onOpenChange={(o) => !o && !busy && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Open session</DialogTitle>
          </DialogHeader>
          <DialogDescription asChild>
            <div className="space-y-4 text-sm text-foreground">
              <p className="text-muted-foreground">
                Lock funds on SettlementEscrow, then activate through the router to receive an API key
                for this model.
              </p>

              <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
                <p className="text-sm font-medium text-foreground">On-chain contracts</p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Your wallet sends <span className="font-medium">openSession</span> to SettlementEscrow.
                  SubWallet/MetaMask must use the chain RPC below (not the portal URL).
                </p>
                <ContractAddressRow
                  label="SettlementEscrow"
                  address={escrowAddress}
                />
                <ContractAddressRow
                  label="ModelPriceOracle"
                  address={hubConfig.modelPriceOracleAddress}
                />
                <ContractAddressRow
                  label="ProviderRegistry"
                  address={hubConfig.operatorRegistryAddress}
                />
                <ContractAddressRow
                  label="Chain"
                  address={`${hubConfig.chainName} (id ${hubConfig.chainId})`}
                />
                <ContractAddressRow
                  label="Wallet RPC"
                  address={hubConfig.rpcUrl}
                />
                <ContractAddressRow label="Node id" address={nodeId} />
                <ContractAddressRow label="Model id" address={modelIdBytes} />
                {escrowHasCode === false && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertTitle>No contract at escrow address</AlertTitle>
                    <AlertDescription className="text-xs">
                      Portal RPC sees empty bytecode at SettlementEscrow. Redeploy with
                      sparkl-solo/scripts/deploy-local-sync-env.sh and restart yarn dev.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="rounded-md border bg-muted/30 p-3 space-y-1 font-mono text-xs break-all">
                <div>
                  <span className="text-muted-foreground">Model name: </span>
                  {offering.model_id}
                </div>
                {offering.quantization && (
                  <div>
                    <span className="text-muted-foreground">Quantization: </span>
                    {offering.quantization}
                  </div>
                )}
                {offering.parameter_count && (
                  <div>
                    <span className="text-muted-foreground">Parameters: </span>
                    {offering.parameter_count}
                  </div>
                )}
                {offering.context_length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Context: </span>
                    {offering.context_length.toLocaleString()}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Capacity: </span>
                  {formatCapacityRatio(offering.active_requests, offering.concurrency)}
                  {offering.queued_requests > 0
                    ? ` (${offering.queued_requests} queued)`
                    : ""}
                </div>
              </div>

              {tunnelOk && offering.concurrency > 0 && offering.available_slots === 0 && (
                <Alert variant="warning">
                  <AlertTitle>Model at capacity</AlertTitle>
                  <AlertDescription>
                    Active inference load is {formatCapacityRatio(offering.active_requests, offering.concurrency)}.
                    New chat requests may receive HTTP 429 until a slot frees.
                  </AlertDescription>
                </Alert>
              )}

              {!listingOk && (
                <Alert variant="warning">
                  <AlertTitle>Node not listed</AlertTitle>
                  <AlertDescription>
                    ProviderRegistry must show this node as active before opening sessions.
                  </AlertDescription>
                </Alert>
              )}

              {!tunnelOk && (
                <Alert variant="warning">
                  <AlertTitle>Tunnel offline</AlertTitle>
                  <AlertDescription>
                    Router reports tunnel status &quot;{offering.tunnel_status}&quot; for this offering.
                  </AlertDescription>
                </Alert>
              )}

              {rateOracleStale && (
                <Alert variant="destructive">
                  <AlertTitle>DOT/USD rate stale</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap text-xs">
                    {formatRateTooStaleHelp(hubConfig.chainEnv)}
                    {rateOracleStatus ? (
                      <>
                        {"\n\n"}RateSetter: {rateOracleStatus.oracleAddress}
                        {"\n"}Last update:{" "}
                        {rateOracleStatus.updatedAt > 0n
                          ? `${rateOracleStatus.updatedAt.toString()} (unix)`
                          : "never"}
                        {"\n"}Max staleness:{" "}
                        {rateOracleStatus.maxStalenessSecs > 0n
                          ? `${rateOracleStatus.maxStalenessSecs.toString()}s`
                          : "disabled"}
                      </>
                    ) : null}
                  </AlertDescription>
                </Alert>
              )}

              {tierOptions.length > 1 && (
                <div className="space-y-2">
                  <Label>Security tier</Label>
                  <Tabs
                    value={tierTab.id}
                    onValueChange={(v) => {
                      const t = tierOptions.find((x) => x.id === v);
                      if (t) setTierTab(t);
                    }}
                  >
                    <TabsList className="w-full">
                      {tierOptions.map((t) => (
                        <TabsTrigger key={t.id} value={t.id} className="flex-1">
                          {t.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="open-session-name">Session name (optional)</Label>
                <Input
                  id="open-session-name"
                  value={sessionNameInput}
                  onChange={(e) => {
                    setSessionNameInput(e.target.value);
                    setNameError(null);
                  }}
                  disabled={busy}
                  maxLength={MAX_SESSION_NAME_CHARS}
                  placeholder="e.g. Qwen experiments"
                />
                <p className="text-xs text-muted-foreground">
                  Up to {MAX_SESSION_NAME_CHARS} characters. Stored on-chain with the session.
                </p>
                {nameError && (
                  <p className="text-xs text-destructive">{nameError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Lock amount (internal units, 18 decimals)</Label>
                <Input
                  value={lockAmount}
                  onChange={(e) => setLockAmount(e.target.value)}
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  Internal balance: {fieldFromWei(dotBalance)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Payment</Label>
                <Tabs
                  value={modeTab.id}
                  onValueChange={(v) => {
                    const m = MODE_TABS.find((x) => x.id === v);
                    if (m) setModeTab(m);
                  }}
                >
                  <TabsList className="w-full">
                    {MODE_TABS.map((m) => (
                      <TabsTrigger key={m.id} value={m.id} className="flex-1 text-xs sm:text-sm">
                        {m.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              {openedSessionId !== null && activateOnly && (
                <Alert variant="warning">
                  <AlertTitle>Session opened — activation pending</AlertTitle>
                  <AlertDescription className="space-y-2 text-sm">
                    <p>
                      Session{" "}
                      <span className="font-mono tabular-nums">{openedSessionId.toString()}</span>{" "}
                      is on-chain. Your escrow balance was reduced because funds are locked for this
                      session.
                    </p>
                    <p>
                      <NextLink href="/user/session" className="underline underline-offset-2">
                        My sessions
                      </NextLink>{" "}
                      lists open sessions; use &quot;Show API key again&quot; there if activation
                      keeps failing.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant={activateOnly ? "warning" : "destructive"}>
                  <AlertTitle>{activateOnly ? "Activation failed" : "Error"}</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </DialogDescription>
          <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
            {activateOnly && openedSessionId !== null ? (
              <Button
                onClick={() => void runActivateOnly(openedSessionId)}
                disabled={busy || !routerConfigured}
              >
                {busy ? "Activating…" : "Activate session"}
              </Button>
            ) : (
              <Button
                onClick={() => void runOpenAndActivate()}
                disabled={
                  busy ||
                  !listingOk ||
                  !tunnelOk ||
                  !routerConfigured ||
                  escrowHasCode === false ||
                  nameError !== null
                }
              >
                {busy ? "Opening…" : "Open & activate"}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {activateOnly ? "Close" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApiKeyRevealModal
        open={Boolean(apiKey)}
        onClose={() => {
          setApiKey(null);
          onClose();
        }}
        apiKey={apiKey ?? ""}
        sessionId={sessionId?.toString() ?? ""}
        title="Session API key"
        description="Your session is open and activated. Copy this key now; use it with the Sparkl router base URL."
      />
    </>
  );
}

export function OpenSessionModal({ open, nodeId, offering, ...props }: Props) {
  if (!open) return null;
  return (
    <OpenSessionForm
      key={`${nodeId}-${offering.model_id}`}
      nodeId={nodeId}
      offering={offering}
      {...props}
    />
  );
}
