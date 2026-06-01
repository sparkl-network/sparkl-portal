import type { EscrowSession } from "@/lib/types";

export type SettleSplit = {
  toProvider: bigint;
  toUser: bigint;
};

export class SettleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettleValidationError";
  }
}

/** Remaining lock available to settle (`lockedInternal`). */
export function remainingLock(session: EscrowSession): bigint {
  return session.lockedInternal;
}

/**
 * Provider share still owed on-chain: `usageRecorded - paidToProviderInternal`,
 * capped by remaining lock.
 */
export function providerOwedInternal(session: EscrowSession): bigint {
  const owed = session.usageRecorded - session.paidToProviderInternal;
  if (owed <= 0n) return 0n;
  return owed > session.lockedInternal ? session.lockedInternal : owed;
}

/**
 * Default full settle split: pay provider up to recorded usage, refund remainder to user.
 */
export function suggestSettleSplit(session: EscrowSession): SettleSplit {
  const locked = remainingLock(session);
  if (locked === 0n) {
    return { toProvider: 0n, toUser: 0n };
  }
  const toProvider = providerOwedInternal(session);
  const toUser = locked - toProvider;
  return { toProvider, toUser };
}

/** Mirrors `SettlementEscrow._settle` rules for `settleFull` (`mustDrain == true`). */
export function assertSettleFullValid(
  session: EscrowSession,
  toProvider: bigint,
  toUser: bigint,
): void {
  if (session.settled) {
    throw new SettleValidationError("Session is already settled.");
  }
  const locked = remainingLock(session);
  if (locked === 0n) {
    throw new SettleValidationError("No locked balance remains on this session.");
  }
  const out = toProvider + toUser;
  if (out !== locked) {
    throw new SettleValidationError(
      `Full settle must drain the lock (${locked.toString()} internal); split sums to ${out.toString()}.`,
    );
  }
  if (toProvider < 0n || toUser < 0n) {
    throw new SettleValidationError("Amounts must be non-negative.");
  }
  const newPaid = session.paidToProviderInternal + toProvider;
  if (newPaid > session.usageRecorded) {
    throw new SettleValidationError(
      "Provider payout exceeds recorded usage for this session.",
    );
  }
}
