"use client";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@coinbase/cds-web/overlays";
import { Banner } from "@coinbase/cds-web/banner";
import { Button } from "@coinbase/cds-web/buttons";
import { TextInput } from "@coinbase/cds-web/controls";
import { VStack } from "@coinbase/cds-web/layout";
import { Text } from "@coinbase/cds-web/typography";
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
  visible: boolean;
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
}: Omit<Props, "visible">) {
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
    <Modal visible onClose={onClose} accessibilityLabel="Close session">
      <ModalHeader title="Close session" />
      <ModalBody paddingX={3} paddingY={2}>
        <VStack gap={2}>
          <Text font="body" color="fgMuted">
            Closes session {sessionId.toString()} and remits the remaining lock.
            Provider share is credited on-chain; your share returns to escrow
            balance (internal DOT).
          </Text>
          <Text font="caption" color="fgMuted">
            Locked: {fieldFromWei(locked)} · Usage recorded:{" "}
            {fieldFromWei(session.usageRecorded)} · Already paid to provider:{" "}
            {fieldFromWei(session.paidToProviderInternal)}
          </Text>
          <TextInput
            label="Pay provider (internal DOT)"
            value={toProviderInput}
            onChange={(e) => setToProviderInput(e.target.value)}
            disabled={busy}
          />
          <TextInput
            label="Refund user (internal DOT)"
            value={toUserInput}
            onChange={(e) => setToUserInput(e.target.value)}
            disabled={busy}
          />
          <Banner variant="informational" startIcon="info" showDismiss={false} title="After close">
            <Text font="caption" color="fgMuted">
              Any API key for this session stops working. Router and nodes reject
              settled sessions.
            </Text>
          </Banner>
          {error ? (
            <Banner variant="error" startIcon="warning" showDismiss={false} title="Error">
              <Text font="body">{error}</Text>
            </Banner>
          ) : null}
        </VStack>
      </ModalBody>
      <ModalFooter
        primaryAction={
          <Button onClick={submit} loading={busy} disabled={locked === 0n}>
            Settle and close
          </Button>
        }
        secondaryAction={
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        }
      />
    </Modal>
  );
}

export function CloseSessionModal({ visible, ...props }: Props) {
  if (!visible) return null;
  return <CloseSessionForm key={props.sessionId.toString()} {...props} />;
}
