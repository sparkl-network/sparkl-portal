import {
  type Address,
  type PublicClient,
  type WalletClient,
  encodeFunctionData,
  getAddress,
} from "viem";

import { settlementEscrowAbi } from "@/lib/abi";
import { type EscrowSession, SecurityTier } from "@/lib/types";

import { INTERNAL_DOT_DECIMALS, internalToNative } from "./dotUnits";

let warnedWalletNativeMismatch = false;

function assertNativeDecimals(d: number): number {
  if (
    !Number.isInteger(d) ||
    d <= 0 ||
    d > INTERNAL_DOT_DECIMALS
  ) {
    throw new Error(
      `nativeDecimals must be 1…${INTERNAL_DOT_DECIMALS} (got ${d})`,
    );
  }
  return d;
}

function nativeDecimalsFromWalletChain(chain: {
  nativeCurrency: { decimals: number };
}): number {
  return assertNativeDecimals(chain.nativeCurrency.decimals);
}

function warnIfWalletNativeMismatch(
  chain: { id?: number; nativeCurrency: { decimals: number } } | undefined,
  appNativeDecimals: number,
): void {
  if (
    typeof window === "undefined" ||
    warnedWalletNativeMismatch ||
    !chain
  ) {
    return;
  }
  const w = chain.nativeCurrency.decimals;
  if (w !== appNativeDecimals) {
    warnedWalletNativeMismatch = true;
    console.warn(
      `[sparkl-portal] Wallet metadata uses ${w} native decimals but the app uses ${appNativeDecimals} (from HubChainConfig / .env). Approval UI may not match; remove and re-add chain ${chain.id ?? ""} or use Switch network. Deposits now use the app decimals so balances should match your escrow.`,
    );
  }
}

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

/**
 * @param publicClient Wagmi `publicClient` (same-origin `/api/rpc` when the proxy is on). Used to
 * `estimateGas` / fees **before** `writeContract` so MetaMask sends a mostly complete
 * `eth_sendTransaction` and does fewer extra JSON-RPC round-trips via the extension — those
 * sometimes fail with `Failed to fetch` even when the tab’s own RPC works.
 * @param nativeDecimals Must match `SettlementEscrow.nativeDotDecimals` and `hubConfig.nativeCurrency.decimals`
 * (from .env). Do not use the wallet connector’s decimals alone — MetaMask may still have stale chain metadata.
 */
export async function depositDot(
  walletClient: WalletClient,
  publicClient: PublicClient,
  escrowAddress: Address,
  amountInternal: bigint,
  nativeDecimals: number,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  const nd = assertNativeDecimals(nativeDecimals);
  warnIfWalletNativeMismatch(chain, nd);
  const value = internalToNative(amountInternal, nd);
  const data = encodeFunctionData({
    abi: settlementEscrowAbi,
    functionName: "depositDot",
    args: [],
  });

  const gas = await publicClient.estimateGas({
    account: account.address,
    to: escrowAddress,
    data,
    value,
  });

  let feeFields:
    | { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }
    | { gasPrice: bigint };
  try {
    const fees = await publicClient.estimateFeesPerGas();
    if (fees.maxFeePerGas != null && fees.maxPriorityFeePerGas != null) {
      feeFields = {
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      };
    } else {
      feeFields = { gasPrice: await publicClient.getGasPrice() };
    }
  } catch {
    feeFields = { gasPrice: await publicClient.getGasPrice() };
  }

  return walletClient.writeContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "depositDot",
    args: [],
    chain,
    account,
    value,
    gas,
    ...feeFields,
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
 * @param nativeDecimals Same semantics as `depositDot` when `mode === "native"`.
 */
export async function openSession(
  walletClient: WalletClient,
  escrowAddress: Address,
  provider: Address,
  tier: SecurityTier,
  amountInternal: bigint,
  mode: OpenSessionMode,
  nativeDecimals?: number,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  const nd =
    mode === "native"
      ? assertNativeDecimals(
          nativeDecimals ?? nativeDecimalsFromWalletChain(chain),
        )
      : 0;
  const value =
    mode === "native" ? internalToNative(amountInternal, nd) : BigInt(0);

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
