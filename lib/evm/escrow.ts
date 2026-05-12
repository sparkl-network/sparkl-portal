import { type Address, type PublicClient, type WalletClient, getAddress } from "viem";

import { settlementEscrowAbi } from "@/lib/abi";
import { type EscrowSession, SecurityTier } from "@/lib/types";

import { internalToNative } from "./dotUnits";

export async function getDotBalance(
  publicClient: PublicClient,
  escrowAddress: Address,
  user: Address,
): Promise<bigint> {
  const raw = await publicClient.readContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "getDotBalances",
    args: [user],
  });
  return raw as bigint;
}

/** Deposit native DOT; `amountInternal` is converted to native Planck (`msg.value`). */
export async function depositDot(
  walletClient: WalletClient,
  escrowAddress: Address,
  amountInternal: bigint,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  const value = internalToNative(amountInternal);
  return walletClient.writeContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "depositDot",
    args: [],
    chain,
    account,
    value,
  });
}

export async function withdrawDot(
  walletClient: WalletClient,
  escrowAddress: Address,
  amountInternal: bigint,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return walletClient.writeContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "withdrawDot",
    args: [amountInternal],
    chain,
    account,
  });
}

export type OpenSessionMode = "dotBalance" | "native";

/**
 * Open session locking `amountInternal`. Use `dotBalance` to debit `dotBalances`; use `native` to
 * send `msg.value` equal to converted native amount.
 */
export async function openSession(
  walletClient: WalletClient,
  escrowAddress: Address,
  provider: Address,
  tier: SecurityTier,
  amountInternal: bigint,
  mode: OpenSessionMode,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  const value =
    mode === "native" ? internalToNative(amountInternal) : BigInt(0);

  return walletClient.writeContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "openSession",
    args: [provider, tier, amountInternal],
    chain,
    account,
    value,
  });
}

export async function getSession(
  publicClient: PublicClient,
  escrowAddress: Address,
  sessionId: bigint,
): Promise<EscrowSession> {
  const row = await publicClient.readContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "sessions",
    args: [sessionId],
  });
  return normalizeSession(row);
}

export async function settlePartial(
  walletClient: WalletClient,
  escrowAddress: Address,
  sessionId: bigint,
  toProvider: bigint,
  toUser: bigint,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return walletClient.writeContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "settlePartial",
    args: [sessionId, toProvider, toUser],
    chain,
    account,
  });
}

export async function settleFull(
  walletClient: WalletClient,
  escrowAddress: Address,
  sessionId: bigint,
  toProvider: bigint,
  toUser: bigint,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return walletClient.writeContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "settleFull",
    args: [sessionId, toProvider, toUser],
    chain,
    account,
  });
}

function normalizeSession(row: unknown): EscrowSession {
  if (Array.isArray(row)) {
    return {
      user: getAddress(row[0] as Address),
      provider: getAddress(row[1] as Address),
      tier: Number(row[2]) as SecurityTier,
      lockedInternal: row[3] as bigint,
      usageRecorded: row[4] as bigint,
      paidToProviderInternal: row[5] as bigint,
      openingInternal: row[6] as bigint,
      openedAt: row[7] as bigint,
      settled: Boolean(row[8]),
    };
  }
  const s = row as {
    user: Address;
    provider: Address;
    tier: number | bigint;
    lockedInternal: bigint;
    usageRecorded: bigint;
    paidToProviderInternal: bigint;
    openingInternal: bigint;
    openedAt: bigint;
    settled: boolean;
  };
  return {
    user: getAddress(s.user),
    provider: getAddress(s.provider),
    tier: Number(s.tier) as SecurityTier,
    lockedInternal: s.lockedInternal,
    usageRecorded: s.usageRecorded,
    paidToProviderInternal: s.paidToProviderInternal,
    openingInternal: s.openingInternal,
    openedAt: s.openedAt,
    settled: s.settled,
  };
}
