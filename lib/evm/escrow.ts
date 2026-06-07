import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  parseAbi,
  parseAbiItem,
  type TransactionReceipt,
  zeroAddress,
} from "viem";
import type { Connector } from "wagmi";

import { settlementEscrowAbi } from "@/lib/abi";
import { type EscrowSession, SecurityTier } from "@/lib/types";

import { decodeSessionFromReturndata } from "./decodeSessionReturndata";
import { readEffectiveModelPrice } from "./modelOracle";
import { INTERNAL_DOT_DECIMALS, internalToNative } from "./dotUnits";
import { sendViaInjectedProvider } from "./sendViaInjectedProvider";
import {
  isSessionsDecodeError,
  sessionsGetterAbi,
  sessionsGetterLegacyNoPricingAbi,
} from "./sessionsGetterAbi";

const sessionsCallAbi = parseAbi(["function sessions(uint256 sessionId) view"]);

/** Minimal `IPriceOracle` surface linked from `SettlementEscrow.priceOracle()`. */
const priceOracleUsdcAbi = parseAbi(["function getUsdcPerDot() view returns (uint256)"]);

/** Wallet JSON-RPC transport failures (SubWallet/MetaMask), not on-chain reverts. */
export function isWalletTransportError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("internal error was received") ||
    lower.includes("-32603") ||
    lower.includes("address not found") ||
    lower.includes("network request failed") ||
    lower.includes("networkerror")
  );
}

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
    functionName: "depositDot" | "withdrawDot" | "openSession";
    args: readonly unknown[];
    value?: bigint;
  },
  connector?: Connector,
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

  const prepared = await publicClient.prepareTransactionRequest({
    account,
    chain,
    to: params.address,
    data,
    value: params.value ?? 0n,
  });

  const injectedTx = {
    from: account.address,
    to: params.address,
    data,
    value: params.value ?? 0n,
    gas: prepared.gas,
    maxFeePerGas: prepared.maxFeePerGas,
    maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
    gasPrice: prepared.gasPrice,
  };

  // SubWallet/MetaMask: prefer the connected connector’s eth_sendTransaction (portal already simulated).
  if (connector) {
    try {
      return await sendViaInjectedProvider(injectedTx, connector);
    } catch (injectedErr) {
      if (!isWalletTransportError(injectedErr)) throw injectedErr;
    }
  }

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
    if (!isWalletTransportError(walletWriteErr)) throw walletWriteErr;
    try {
      return await walletClient.sendTransaction({
        account,
        chain,
        to: params.address,
        data,
        value: params.value ?? 0n,
      });
    } catch {
      return sendViaInjectedProvider(injectedTx, connector);
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
  connector?: Connector,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  const nd = assertNativeDecimals(nativeDecimals);
  warnIfWalletNativeMismatch(chain, nd);
  const value = internalToNative(amountInternal, nd);

  return writeSimulatedEscrowCall(
    walletClient,
    publicClient,
    {
      address: escrowAddress,
      functionName: "depositDot",
      args: [],
      value,
    },
    connector,
  );
}

export async function withdrawDot(
  walletClient: WalletClient,
  publicClient: PublicClient,
  escrowAddress: Address,
  amountInternal: bigint,
  connector?: Connector,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return writeSimulatedEscrowCall(
    walletClient,
    publicClient,
    {
      address: escrowAddress,
      functionName: "withdrawDot",
      args: [amountInternal],
    },
    connector,
  );
}

export type OpenSessionMode = "dotBalance" | "native";

export const MAX_SESSION_NAME_CHARS = 128;

/** Trim and validate optional session name (Unicode code points). Empty is allowed. */
export function normalizeSessionName(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return "";
  const chars = [...trimmed];
  if (chars.length > MAX_SESSION_NAME_CHARS) {
    throw new Error(`Session name must be at most ${MAX_SESSION_NAME_CHARS} characters.`);
  }
  return trimmed;
}

/**
 * Open session locking `amountInternal`. Use `dotBalance` to debit `dotBalances`; use `native` to
 * send `msg.value` equal to converted native amount.
 * @param nativeDecimals Same semantics as `depositDot` when `mode === "native"`.
 */
export async function openSession(
  walletClient: WalletClient,
  publicClient: PublicClient,
  escrowAddress: Address,
  nodeId: Hex,
  tier: SecurityTier,
  modelId: Hex,
  amountInternal: bigint,
  name: string,
  mode: OpenSessionMode,
  nativeDecimals?: number,
  connector?: Connector,
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

  return writeSimulatedEscrowCall(
    walletClient,
    publicClient,
    {
      address: escrowAddress,
      functionName: "openSession",
      args: [nodeId, tier, modelId, amountInternal, name],
      value,
    },
    connector,
  );
}

export async function getSession(
  publicClient: PublicClient,
  escrowAddress: Address,
  sessionId: bigint,
): Promise<EscrowSession> {
  try {
    const { data } = await publicClient.call({
      to: escrowAddress,
      data: encodeFunctionData({
        abi: sessionsCallAbi,
        functionName: "sessions",
        args: [sessionId],
      }),
    });
    if (!data || data === "0x") {
      throw new Error("sessions() returned empty data");
    }
    return decodeSessionFromReturndata(data);
  } catch (rawError) {
    try {
      const row = await publicClient.readContract({
        address: escrowAddress,
        abi: sessionsGetterAbi,
        functionName: "sessions",
        args: [sessionId],
      });
      return normalizeSession(row);
    } catch (error) {
      if (!isSessionsDecodeError(error) && !isSessionsDecodeError(rawError)) {
        throw error;
      }
      const row = await publicClient.readContract({
        address: escrowAddress,
        abi: sessionsGetterLegacyNoPricingAbi,
        functionName: "sessions",
        args: [sessionId],
      });
      return normalizeSession(row);
    }
  }
}

/** Must match SettlementEscrow `SessionOpened` (includes pricing snapshot fields). */
export const sessionOpenedEvent = parseAbiItem(
  "event SessionOpened(uint256 indexed sessionId, address indexed user, bytes32 indexed nodeId, uint8 tier, bytes32 modelId, uint256 lockedInternal, uint256 inputPricePer1kAtOpen, uint256 outputPricePer1kAtOpen, uint256 usdcPerDotAtOpen, bool pricingUsedDefault, string name)",
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

/** Escrow session still open (not fully settled, funds locked). */
export function isEscrowSessionOpen(session: EscrowSession): boolean {
  return !session.settled && session.lockedInternal > 0n;
}

/**
 * Open escrow session counts per `modelId` (bytes32 hex, lowercased) for one node.
 * Scans `SessionOpened` logs for the node, then reads each session’s settled/lock state.
 */
export async function countOpenEscrowSessionsByModelForNode(
  publicClient: PublicClient,
  escrowAddress: Address,
  nodeId: Hex,
  opts?: { fromBlock?: bigint },
): Promise<Map<string, number>> {
  if (escrowAddress.toLowerCase() === zeroAddress.toLowerCase()) {
    return new Map();
  }

  const ids = await getSessionIdsForNode(
    publicClient,
    escrowAddress,
    nodeId,
    opts,
  );
  const counts = new Map<string, number>();

  await Promise.all(
    ids.map(async (sessionId) => {
      const session = await getSession(publicClient, escrowAddress, sessionId);
      if (!isEscrowSessionOpen(session)) return;
      const key = session.modelId.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }),
  );

  return counts;
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
      const args = decoded.args as unknown as { sessionId: bigint };
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

function chainTier(value: unknown): SecurityTier {
  const n = typeof value === "bigint" ? value : BigInt(value as number | string);
  if (n === 1n) return SecurityTier.TEE_VERIFIED;
  return SecurityTier.BEST_EFFORT;
}

/** Maps `SettlementEscrow.sessions` getter (flat or named) to {@link EscrowSession}. */
export function normalizeSession(row: unknown): EscrowSession {
  if (Array.isArray(row)) {
    if (row.length >= 18) {
      return {
        user: getAddress(row[0] as Address),
        nodeId: row[1] as Hex,
        modelId: row[2] as Hex,
        tier: chainTier(row[3]),
        lockedInternal: row[4] as bigint,
        usageRecorded: row[5] as bigint,
        paidToProviderInternal: row[6] as bigint,
        paidToProtocolInternal: row[7] as bigint,
        openingInternal: row[8] as bigint,
        openedAt: BigInt(row[9] as bigint | number),
        settled: Boolean(row[10]),
        inputTokensRecorded: BigInt(row[11] as bigint | number),
        outputTokensRecorded: BigInt(row[12] as bigint | number),
        inputPricePer1kAtOpen: row[13] as bigint,
        outputPricePer1kAtOpen: row[14] as bigint,
        usdcPerDotAtOpen: row[15] as bigint,
        pricingUsedDefault: Boolean(row[16]),
        name: typeof row[17] === "string" ? row[17] : "",
      };
    }
    if (row.length >= 14) {
      return {
        user: getAddress(row[0] as Address),
        nodeId: row[1] as Hex,
        modelId: row[2] as Hex,
        tier: chainTier(row[3]),
        lockedInternal: row[4] as bigint,
        usageRecorded: row[5] as bigint,
        paidToProviderInternal: row[6] as bigint,
        paidToProtocolInternal: row[7] as bigint,
        openingInternal: row[8] as bigint,
        openedAt: BigInt(row[9] as bigint | number),
        settled: Boolean(row[10]),
        inputTokensRecorded: BigInt(row[11] as bigint | number),
        outputTokensRecorded: BigInt(row[12] as bigint | number),
        inputPricePer1kAtOpen: 0n,
        outputPricePer1kAtOpen: 0n,
        usdcPerDotAtOpen: 0n,
        pricingUsedDefault: false,
        name: typeof row[13] === "string" ? row[13] : "",
      };
    }
    if (row.length >= 12) {
      return {
        user: getAddress(row[0] as Address),
        nodeId: row[1] as Hex,
        modelId: row[2] as Hex,
        tier: chainTier(row[3]),
        lockedInternal: row[4] as bigint,
        usageRecorded: row[5] as bigint,
        paidToProviderInternal: 0n,
        paidToProtocolInternal: 0n,
        openingInternal: row[6] as bigint,
        openedAt: BigInt(row[7] as bigint | number),
        settled: Boolean(row[8]),
        inputTokensRecorded: BigInt(row[9] as bigint | number),
        outputTokensRecorded: BigInt(row[10] as bigint | number),
        inputPricePer1kAtOpen: 0n,
        outputPricePer1kAtOpen: 0n,
        usdcPerDotAtOpen: 0n,
        pricingUsedDefault: false,
        name: typeof row[11] === "string" ? row[11] : "",
      };
    }
    throw new Error(`unexpected sessions return length: ${row.length}`);
  }
  const s = row as {
    user: Address;
    nodeId: Hex;
    modelId: Hex;
    tier: number | bigint;
    lockedInternal: bigint;
    usageRecorded: bigint;
    paidToProviderInternal: bigint;
    paidToProtocolInternal: bigint;
    openingInternal: bigint;
    openedAt: bigint;
    settled: boolean;
    inputTokensRecorded?: bigint;
    outputTokensRecorded?: bigint;
    inputPricePer1kAtOpen?: bigint;
    outputPricePer1kAtOpen?: bigint;
    usdcPerDotAtOpen?: bigint;
    pricingUsedDefault?: boolean;
    name?: string;
  };
  return {
    user: getAddress(s.user),
    nodeId: s.nodeId,
    modelId: s.modelId,
    tier: chainTier(s.tier),
    lockedInternal: s.lockedInternal,
    usageRecorded: s.usageRecorded,
    paidToProviderInternal: s.paidToProviderInternal,
    paidToProtocolInternal: s.paidToProtocolInternal,
    openingInternal: s.openingInternal,
    openedAt: s.openedAt,
    settled: s.settled,
    inputTokensRecorded: s.inputTokensRecorded ?? 0n,
    outputTokensRecorded: s.outputTokensRecorded ?? 0n,
    inputPricePer1kAtOpen: s.inputPricePer1kAtOpen ?? 0n,
    outputPricePer1kAtOpen: s.outputPricePer1kAtOpen ?? 0n,
    usdcPerDotAtOpen: s.usdcPerDotAtOpen ?? 0n,
    pricingUsedDefault: s.pricingUsedDefault ?? false,
    name: s.name ?? "",
  };
}

/** USDC (6-dec) per 1e18 internal DOT via the escrow-linked price oracle. */
export async function readEscrowUsdcPerDot(
  publicClient: PublicClient,
  escrowAddress: Address,
): Promise<bigint> {
  const oracleAddress = (await publicClient.readContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "priceOracle",
  })) as Address;
  return publicClient.readContract({
    address: oracleAddress,
    abi: priceOracleUsdcAbi,
    functionName: "getUsdcPerDot",
  }) as Promise<bigint>;
}

/**
 * Live oracle rates when {@link EscrowSession.inputPricePer1kAtOpen} is zero (pre-snapshot sessions).
 * Prefer {@link sessionPricing} from `lib/session/pricing.ts` when snapshot fields are set.
 */
export async function loadSessionPricingFallback(
  publicClient: PublicClient,
  escrowAddress: Address,
  modelOracleAddress: Address,
  session: EscrowSession,
): Promise<{
  inputPricePer1k: bigint;
  outputPricePer1k: bigint;
  usdcPerDot: bigint;
  usedDefault: boolean;
  legacy: true;
}> {
  const [price, usdcPerDot] = await Promise.all([
    readEffectiveModelPrice(publicClient, modelOracleAddress, session.modelId),
    readEscrowUsdcPerDot(publicClient, escrowAddress),
  ]);
  return {
    inputPricePer1k: price.inputPer1kTokens,
    outputPricePer1k: price.outputPer1kTokens,
    usdcPerDot,
    usedDefault: price.usedDefault,
    legacy: true,
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
