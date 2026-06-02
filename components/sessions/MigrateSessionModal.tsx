"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatUnits, isHex, parseUnits, size } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import type { Address, Hex, PublicClient, WalletClient } from "viem";

import {
  getSession,
  openSession,
  parseSessionIdFromReceipt,
  settleFull,
  type OpenSessionMode,
} from "@/lib/evm/escrow";
import { formatTxError } from "@/lib/evm/formatTxError";
import { listNetworkModels } from "@/lib/evm/modelOracle";
import { activateSessionViaPortal } from "@/lib/router/activateClient";
import {
  assertSettleFullValid,
  SettleValidationError,
  suggestSettleSplit,
} from "@/lib/evm/sessionSettle";
import { SecurityTier, type EscrowSession } from "@/lib/types";

import { ApiKeyRevealModal } from "./ApiKeyRevealModal";

type Props = {
  open: boolean;
  onClose: () => void;
  sessionId: bigint;
  session: EscrowSession;
  escrowAddress: Address;
  oracleAddress: Address;
  walletClient: WalletClient;
  publicClient: PublicClient;
  dotBalance: bigint;
  onComplete: () => void;
};

type Step = "close" | "open" | "activate";

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

function parseNodeId(raw: string): Hex | null {
  const s = raw.trim();
  if (!isHex(s) || size(s) !== 32) return null;
  return s as Hex;
}

function defaultLockAmount(session: EscrowSession, dotBalance: bigint): string {
  if (session.lockedInternal > 0n) return fieldFromWei(session.lockedInternal);
  if (dotBalance > 0n) return fieldFromWei(dotBalance);
  return "1";
}

function MigrateSessionForm({
  onClose,
  sessionId,
  session,
  escrowAddress,
  oracleAddress,
  walletClient,
  publicClient,
  dotBalance,
  onComplete,
}: Omit<Props, "open">) {
  const suggested = useMemo(() => suggestSettleSplit(session), [session]);

  const [step, setStep] = useState<Step>("close");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toProviderInput, setToProviderInput] = useState(() =>
    fieldFromWei(suggested.toProvider),
  );
  const [toUserInput, setToUserInput] = useState(() =>
    fieldFromWei(suggested.toUser),
  );

  const [nodeIdInput, setNodeIdInput] = useState(session.nodeId as `0x${string}`);
  const [tierTab, setTierTab] = useState<(typeof TIER_TABS)[number]>(() =>
    session.tier === SecurityTier.TEE_VERIFIED ? TIER_TABS[1] : TIER_TABS[0],
  );
  const [modeTab, setModeTab] = useState<(typeof MODE_TABS)[number]>(() =>
    dotBalance > 0n ? MODE_TABS[0] : MODE_TABS[1],
  );
  const [modelNameOverride, setModelNameOverride] = useState<string | null>(null);
  const [lockAmount, setLockAmount] = useState(() =>
    defaultLockAmount(session, dotBalance),
  );

  const [newSessionId, setNewSessionId] = useState<bigint | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  const { data: models = [] } = useQuery({
    queryKey: ["networkModels", oracleAddress],
    queryFn: () => listNetworkModels(publicClient, oracleAddress),
    enabled: step === "open",
  });

  const defaultModelName = useMemo(() => {
    const match = models.find(
      (m) => m.modelId.toLowerCase() === session.modelId.toLowerCase(),
    );
    return match?.name ?? models[0]?.name ?? "";
  }, [models, session.modelId]);

  const modelName = modelNameOverride ?? defaultModelName;

  async function runClose() {
    setError(null);
    const toProvider = parseField(toProviderInput);
    const toUser = parseField(toUserInput);
    if (toProvider === null || toUser === null) {
      setError("Enter valid settle amounts.");
      return;
    }
    try {
      assertSettleFullValid(session, toProvider, toUser);
    } catch (e) {
      setError(e instanceof SettleValidationError ? e.message : String(e));
      return;
    }

    setBusy(true);
    try {
      const hash = await settleFull(
        walletClient,
        escrowAddress,
        sessionId,
        toProvider,
        toUser,
      );
      await waitForTransactionReceipt(publicClient, { hash });
      const refreshed = await getSession(publicClient, escrowAddress, sessionId);
      if (!refreshed.settled) {
        setError("Session did not settle on-chain. Check the transaction.");
        return;
      }
      setStep("open");
    } catch (e) {
      setError(formatTxError(e));
    } finally {
      setBusy(false);
    }
  }

  async function runOpen() {
    setError(null);
    const nodeId = parseNodeId(nodeIdInput);
    if (!nodeId) {
      setError("Node id must be 32-byte hex (0x + 64 hex chars).");
      return;
    }
    const amount = parseField(lockAmount);
    if (amount === null || amount <= 0n) {
      setError("Enter a positive lock amount.");
      return;
    }
    const model = models.find((m) => m.name === modelName);
    if (!model) {
      setError("Select a listed model.");
      return;
    }
    const mode: OpenSessionMode = modeTab.id;
    if (mode === "dotBalance" && amount > dotBalance) {
      setError("Lock amount exceeds internal DOT balance. Fund /user or use native deposit.");
      return;
    }

    const tier =
      tierTab.id === "tee" ? SecurityTier.TEE_VERIFIED : SecurityTier.BEST_EFFORT;

    setBusy(true);
    try {
      const hash = await openSession(
        walletClient,
        escrowAddress,
        nodeId,
        tier,
        model.modelId,
        amount,
        mode,
        hubNativeDecimals(walletClient),
      );
      const receipt = await waitForTransactionReceipt(publicClient, { hash });
      const sid = parseSessionIdFromReceipt(receipt);
      if (sid === null) {
        setError("Could not read new session id from receipt.");
        return;
      }
      setNewSessionId(sid);
      setStep("activate");
    } catch (e) {
      setError(formatTxError(e));
    } finally {
      setBusy(false);
    }
  }

  async function runActivate() {
    if (newSessionId === null) {
      setError("Open a new session first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await activateSessionViaPortal({
        walletClient,
        publicClient,
        sessionId: newSessionId,
      });
      setApiKey(res.apiKey);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function hubNativeDecimals(walletClient: WalletClient): number | undefined {
    return walletClient.chain?.nativeCurrency?.decimals;
  }

  const stepTitle =
    step === "close"
      ? "1. Close compromised session"
      : step === "open"
        ? "2. Open new session"
        : "3. Activate new session";

  return (
    <>
      <Dialog open={!apiKey} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Migrate session</DialogTitle>
          </DialogHeader>
          <DialogDescription className="flex flex-col gap-3">
            <span className="text-sm font-medium">{stepTitle}</span>

            <Alert variant="warning">
              <AlertTitle>Compromised key</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                This flow settles session {sessionId.toString()} and creates a
                new session id with a new API key. Do not use "Show API key again"
                on the old session.
              </AlertDescription>
            </Alert>

            <Tabs value={step} onValueChange={(v) => setStep(v as Step)}>
              {/* Close step */}
              <div className="space-y-2">
                <Label>Pay provider (internal DOT)</Label>
                <Input
                  value={toProviderInput}
                  onChange={(e) => setToProviderInput(e.target.value)}
                  disabled={busy || step !== "close"}
                />
                <Label>Refund user (internal DOT)</Label>
                <Input
                  value={toUserInput}
                  onChange={(e) => setToUserInput(e.target.value)}
                  disabled={busy || step !== "close"}
                />
              </div>

              {/* Open step */}
              {step === "open" && (
                <>
                  <div className="space-y-1">
                    <Label>Node id (bytes32 hex)</Label>
                    <Input
                      value={nodeIdInput}
                      onChange={(e) => setNodeIdInput(e.target.value as `0x${string}`)}
                      disabled={busy}
                      className="font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Model</label>
                    <select
                      value={modelName}
                      onChange={(e) => setModelNameOverride(e.target.value)}
                      disabled={busy || models.length === 0}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {models.map((m) => (
                        <option key={m.modelId} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Tabs value={tierTab.id} onValueChange={(v) => setTierTab(TIER_TABS.find(t => t.id === v) || TIER_TABS[0])}>
                    <TabsList className="w-full">
                      {TIER_TABS.map((tab) => (
                        <TabsTrigger key={tab.id} value={tab.id} className="flex-1">{tab.label}</TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>

                  <Tabs value={modeTab.id} onValueChange={(v) => setModeTab(MODE_TABS.find(t => t.id === v) || MODE_TABS[0])}>
                    <TabsList className="w-full">
                      {MODE_TABS.map((tab) => (
                        <TabsTrigger key={tab.id} value={tab.id} className="flex-1">{tab.label}</TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>

                  <div className="space-y-1">
                    <Label>Lock amount (internal DOT)</Label>
                    <Input
                      value={lockAmount}
                      onChange={(e) => setLockAmount(e.target.value)}
                      disabled={busy}
                    />
                    <span className="text-xs text-muted-foreground">
                      Internal balance: {fieldFromWei(dotBalance)}
                    </span>
                  </div>
                </>
              )}

              {/* Activate step */}
              {step === "activate" && (
                <p className="text-sm text-muted-foreground">
                  New session {newSessionId?.toString() ?? "—"}. Sign the activate
                  message in your wallet to fetch a new API key from the router.
                </p>
              )}

              {/* Error banner */}
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </Tabs>
          </DialogDescription>
          <DialogFooter className="gap-2 sm:gap-0 sm:flex-row flex flex-col">
            {step === "close" ? (
              <Button onClick={runClose}>{busy ? "Settling..." : "Settle old session"}</Button>
            ) : step === "open" ? (
              <Button onClick={runOpen}>{busy ? "Opening..." : "Open new session"}</Button>
            ) : (
              <Button onClick={runActivate}>{busy ? "Activating..." : "Activate and show key"}</Button>
            )}
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
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
        sessionId={newSessionId?.toString() ?? ""}
        title="New API key"
        description="Your migrated session is active. Copy this key now; it is shown once."
      />
    </>
  );
}

export function MigrateSessionModal({ open, sessionId, ...props }: Props) {
  if (!open) return null;
  return (
    <MigrateSessionForm key={sessionId.toString()} sessionId={sessionId} {...props} />
  );
}
