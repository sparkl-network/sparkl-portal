import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  parseAbiItem,
  type TransactionReceipt,
  zeroAddress,
} from "viem";

import { settlementEscrowAbi } from "@/lib/abi";
import { type EscrowSession, SecurityTier } from "@/lib/types";

import { INTERNAL_DOT_DECIMALS, internalToNative } from "./dotUnits";
import { sendViaInjectedProvider } from "./sendViaInjectedProvider";

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

/**
 * Simulate on `publicClient` (portal `/api/rpc`), then broadcast the returned `request`
 * so MetaMask does not re-run `eth_call` against a stale RPC URL.
 */
async function writeSimulatedEscrowCall(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: {
    address: Address;
    functionName: "depositDot" | "withdrawDot";
    args: readonly [] | readonly [bigint];
    value?: bigint;
  },
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  const rpcChainId = publicClient.chain?.id;
  if (rpcChainId !== undefined && rpcChainId !== chain.id) {
    throw new Error(
      `Wallet reports chain ${chain.id} but the app RPC is on chain ${rpcChainId}. Switch your wallet to the hub chain (id ${rpcChainId}) and try again.`,
    );
  }

  const data = encodeFunctionData({
    abi: settlementEscrowAbi,
    functionName: params.functionName,
    args: params.args,
  });

  await publicClient.simulateContract({
    address: params.address,
    abi: settlementEscrowAbi,
    functionName: params.functionName,
    args: params.args,
    account,
    value: params.value,
  });

  try {
    return await walletClient.writeContract({
      address: params.address,
      abi: settlementEscrowAbi,
      functionName: params.functionName,
      args: params.args,
      account,
      chain,
      value: params.value,
    });
  } catch (walletWriteErr) {
    const msg =
      walletWriteErr instanceof Error
        ? walletWriteErr.message
        : String(walletWriteErr);
    const lower = msg.toLowerCase();
    const rpcish =
      lower.includes("failed to fetch") ||
      lower.includes("internal error was received") ||
      lower.includes("-32603");
    if (!rpcish) throw walletWriteErr;

    const prepared = await publicClient.prepareTransactionRequest({
      account,
      chain,
      to: params.address,
      data,
      value: params.value ?? 0n,
    });

    try {
      return await walletClient.sendTransaction({
        account,
        chain,
        to: params.address,
        data,
        value: params.value ?? 0n,
      });
    } catch {
      return sendViaInjectedProvider({
        from: account.address,
        to: params.address,
        data,
        value: params.value ?? 0n,
        gas: prepared.gas,
        maxFeePerGas: prepared.maxFeePerGas,
        maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
        gasPrice: prepared.gasPrice,
      });
    }
  }
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
 * Escrow view: sessions opened for `nodeId` that have not reached a full settle
 * (`openSessionCountByNode` on `SettlementEscrow`).
 */
export async function readOpenSessionCount(
  publicClient: PublicClient,
  escrowAddress: Address,
  nodeId: Hex,
): Promise<bigint> {
  if (escrowAddress.toLowerCase() === zeroAddress.toLowerCase()) {
    return 0n;
  }
  const raw = await publicClient.readContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "openSessionCountByNode",
    args: [nodeId],
  });
  return raw as bigint;
}

/**
 * @param publicClient Wagmi `publicClient` (same-origin `/api/rpc` when the proxy is on). Used to
 * `simulateContract` on `publicClient` (portal `/api/rpc`), then `writeContract` on the wallet
 * without preset gas/fee fields so MetaMask does not reject the request with internal JSON-RPC errors.
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

  return writeSimulatedEscrowCall(walletClient, publicClient, {
    address: escrowAddress,
    functionName: "depositDot",
    args: [],
    value,
  });
}

export async function withdrawDot(
  walletClient: WalletClient,
  publicClient: PublicClient,
  escrowAddress: Address,
  amountInternal: bigint,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return writeSimulatedEscrowCall(walletClient, publicClient, {
    address: escrowAddress,
    functionName: "withdrawDot",
    args: [amountInternal],
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
  nodeId: Hex,
  tier: SecurityTier,
  modelId: Hex,
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
    args: [nodeId, tier, modelId, amountInternal],
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

const sessionOpenedEvent = parseAbiItem(
  "event SessionOpened(uint256 indexed sessionId, address indexed user, bytes32 indexed nodeId, uint8 tier, bytes32 modelId, uint256 lockedInternal)",
);

/** Session IDs from `SessionOpened` where `nodeId` matches (dev / explorer tooling). */
export async function getSessionIdsForNode(
  publicClient: PublicClient,
  escrowAddress: Address,
  nodeId: Hex,
  opts?: { fromBlock?: bigint },
): Promise<bigint[]> {
  const fromBlockEnv = process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_FROM_BLOCK;
  const fromBlock =
    opts?.fromBlock ?? (fromBlockEnv ? BigInt(fromBlockEnv) : 0n);

  const logs = await publicClient.getLogs({
    address: escrowAddress,
    event: sessionOpenedEvent,
    args: { nodeId },
    fromBlock,
    toBlock: "latest",
  });

  const seen = new Map<string, bigint>();
  for (const log of logs) {
    const sid = log.args.sessionId;
    if (sid === undefined) continue;
    seen.set(sid.toString(), sid);
  }
  return [...seen.values()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Session IDs from `SessionOpened` where `user` matches the connected wallet. */
export async function getSessionIdsForUser(
  publicClient: PublicClient,
  escrowAddress: Address,
  user: Address,
  opts?: { fromBlock?: bigint },
): Promise<bigint[]> {
  const fromBlockEnv = process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_FROM_BLOCK;
  const fromBlock =
    opts?.fromBlock ?? (fromBlockEnv ? BigInt(fromBlockEnv) : 0n);

  const logs = await publicClient.getLogs({
    address: escrowAddress,
    event: sessionOpenedEvent,
    args: { user },
    fromBlock,
    toBlock: "latest",
  });

  const seen = new Map<string, bigint>();
  for (const log of logs) {
    const sid = log.args.sessionId;
    if (sid === undefined) continue;
    seen.set(sid.toString(), sid);
  }
  return [...seen.values()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Parse `sessionId` from a successful `openSession` transaction receipt. */
export function parseSessionIdFromReceipt(
  receipt: Pick<TransactionReceipt, "logs">,
): bigint | null {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: settlementEscrowAbi,
        eventName: "SessionOpened",
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args as { sessionId: bigint };
      return args.sessionId;
    } catch {
      continue;
    }
  }
  return null;
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
      nodeId: row[1] as Hex,
      modelId: row[2] as Hex,
      tier: Number(row[3]) as SecurityTier,
      lockedInternal: row[4] as bigint,
      usageRecorded: row[5] as bigint,
      paidToProviderInternal: row[6] as bigint,
      openingInternal: row[7] as bigint,
      openedAt: row[8] as bigint,
      settled: Boolean(row[9]),
      inputTokensRecorded: (row[10] as bigint) ?? 0n,
      outputTokensRecorded: (row[11] as bigint) ?? 0n,
    };
  }
  const s = row as {
    user: Address;
    nodeId: Hex;
    modelId: Hex;
    tier: number | bigint;
    lockedInternal: bigint;
    usageRecorded: bigint;
    paidToProviderInternal: bigint;
    openingInternal: bigint;
    openedAt: bigint;
    settled: boolean;
    inputTokensRecorded?: bigint;
    outputTokensRecorded?: bigint;
  };
  return {
    user: getAddress(s.user),
    nodeId: s.nodeId,
    modelId: s.modelId,
    tier: Number(s.tier) as SecurityTier,
    lockedInternal: s.lockedInternal,
    usageRecorded: s.usageRecorded,
    paidToProviderInternal: s.paidToProviderInternal,
    openingInternal: s.openingInternal,
    openedAt: s.openedAt,
    settled: s.settled,
    inputTokensRecorded: s.inputTokensRecorded ?? 0n,
    outputTokensRecorded: s.outputTokensRecorded ?? 0n,
  };
}

export async function readTeePriceMultiplierBps(
  publicClient: PublicClient,
  escrowAddress: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "teePriceMultiplierBps",
  }) as Promise<bigint>;
}
