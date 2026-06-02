"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import type { Address, WalletClient } from "viem";
import type { PublicClient } from "viem";

import { settleFull } from "@/lib/evm/escrow";
import { formatTxError } from "@/lib/evm/formatTxError";
import {
  assertSettleFullValid,
  SettleValidationError,
  suggestSettleSplit,
} from "@/lib/evm/sessionSettle";
import type { EscrowSession } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  sessionId: bigint;
  session: EscrowSession;
  escrowAddress: Address;
  walletClient: WalletClient;
  publicClient: PublicClient;
  onSettled: () => void;
};

function fieldFromWei(v: bigint): string {
  return formatUnits(v, 18);
}

function parseField(raw: string): bigint | null {
  try {
    const t = raw.trim();
    if (!t) return null;
    const [whole, frac = ""] = t.split(".");
    const padded = `${whole}${frac.padEnd(18, "0").slice(0, 18)}`;
    return BigInt(padded);
  } catch {
    return null;
  }
}

function CloseSessionForm({
  onClose,
  sessionId,
  session,
  escrowAddress,
  walletClient,
  publicClient,
  onSettled,
}: Omit<Props, "open">) {
  const suggested = useMemo(() => suggestSettleSplit(session), [session]);
  const [toProviderInput, setToProviderInput] = useState(() =>
    fieldFromWei(suggested.toProvider),
  );
  const [toUserInput, setToUserInput] = useState(() =>
    fieldFromWei(suggested.toUser),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = session.lockedInternal;

  async function submit() {
    setError(null);
    const toProvider = parseField(toProviderInput);
    const toUser = parseField(toUserInput);
    if (toProvider === null || toUser === null) {
      setError("Enter valid amounts for provider and user.");
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
      onSettled();
      onClose();
    } catch (e) {
      setError(formatTxError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close session</DialogTitle>
        </DialogHeader>
        <DialogDescription className="flex flex-col gap-2">
          <p className="text-muted-foreground">
            Closes session {sessionId.toString()} and remits the remaining lock.
            Provider share is credited on-chain; your share returns to escrow
            balance (internal DOT).
          </p>
          <span className="text-xs text-muted-foreground">
            Locked: {fieldFromWei(locked)} · Usage recorded:{" "}
            {fieldFromWei(session.usageRecorded)} · Already paid to provider:{" "}
            {fieldFromWei(session.paidToProviderInternal)}
          </span>
          <div className="space-y-1">
            <label className="text-sm font-medium">Pay provider (internal DOT)</label>
            <Input
              value={toProviderInput}
              onChange={(e) => setToProviderInput(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Refund user (internal DOT)</label>
            <Input
              value={toUserInput}
              onChange={(e) => setToUserInput(e.target.value)}
              disabled={busy}
            />
          </div>
          <Alert variant="informational">
            <AlertTitle>After close</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              Any API key for this session stops working. Router and nodes reject
              settled sessions.
            </AlertDescription>
          </Alert>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </DialogDescription>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || locked === 0n}>
            {busy ? "Settling..." : "Settle and close"}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CloseSessionModal({ open, ...props }: Props) {
  if (!open) return null;
  return <CloseSessionForm key={props.sessionId.toString()} {...props} />;
}
