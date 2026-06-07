import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeFunctionData,
  getAddress,
  parseAbiItem,
  zeroHash,
} from "viem";

import { sendViaInjectedProvider } from "@/lib/evm/sendViaInjectedProvider";

import { operatorRegistryAbi } from "@/lib/abi";
import { ZERO_ADDRESS } from "@/lib/chains";
import { softwarePeerIdFromMetadataUri } from "@/lib/nodeBaseUrl";
import { parseNodeIdInput } from "@/lib/nodeId";
import {
  type OperatorDirectoryEntry,
  type OperatorNodeDetailRow,
  type NodeInfo,
  type RegisteredNode,
  NodeLifecycle,
  SecurityTier,
} from "@/lib/types";
import { readOpenSessionCount } from "@/lib/evm/escrow";

const nodeRegisteredEvent = parseAbiItem(
  "event NodeRegistered(bytes32 indexed nodeId, address indexed operator, string metadataURI)",
);

/**
 * Read on-chain **`NodeInfo`** for `nodeId` (ABI function **`getProvider`**).
 */
export async function getNode(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Hex,
): Promise<NodeInfo> {
  const row = await publicClient.readContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "getProvider",
    args: [nodeId],
  });
  return normalizeNodeInfo(row);
}

/** @deprecated Use {@link getNode}. */
export const getProvider = getNode;

export async function getNodeOperator(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Hex,
): Promise<Address> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "nodeOperator",
    args: [nodeId],
  });
  return getAddress(raw as Address);
}

export async function getMetadataURI(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Hex,
): Promise<string> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "getMetadataURI",
    args: [nodeId],
  });
  return raw as string;
}

export async function supportsTier(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Hex,
  tier: SecurityTier,
): Promise<boolean> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "supportsTier",
    args: [nodeId, tier],
  });
  return raw as boolean;
}

function resolveOperatorRegistryFromBlock(opts?: { fromBlock?: bigint }): bigint {
  if (opts?.fromBlock !== undefined) return opts.fromBlock;
  const fromBlockEnv =
    process.env.NEXT_PUBLIC_OPERATOR_REGISTRY_FROM_BLOCK ??
    process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_FROM_BLOCK;
  return fromBlockEnv ? BigInt(fromBlockEnv) : 0n;
}

/**
 * Unique operator addresses that have emitted `NodeRegistered` (or dev list → `nodeOperator` per node).
 * Uses the same from-block env as {@link getAllRegisteredNodes} unless overridden.
 */
/** How many `NodeRegistered` logs exist (for empty-state diagnostics). */
export async function countNodeRegisteredLogs(
  publicClient: PublicClient,
  registryAddress: Address,
  opts?: { fromBlock?: bigint },
): Promise<bigint> {
  const fromBlock = resolveOperatorRegistryFromBlock(opts);
  const logs = await publicClient.getLogs({
    address: registryAddress,
    event: nodeRegisteredEvent,
    fromBlock,
    toBlock: "latest",
  });
  return BigInt(logs.length);
}

export async function getRegisteredOperatorAddresses(
  publicClient: PublicClient,
  registryAddress: Address,
  opts?: { fromBlock?: bigint },
): Promise<Address[]> {
  const rawList =
    process.env.NEXT_PUBLIC_DEV_OPERATOR_NODE_ADDRESSES ??
    process.env.NEXT_PUBLIC_DEV_PROVIDER_ADDRESSES;
  if (rawList?.trim()) {
    const ids = rawList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((a) => parseNodeIdInput(a))
      .filter((x): x is Hex => Boolean(x));
    const uniq = new Map<string, Address>();
    for (const nodeId of ids) {
      const op = await getNodeOperator(publicClient, registryAddress, nodeId);
      const a = getAddress(op);
      uniq.set(a.toLowerCase(), a);
    }
    return [...uniq.values()].sort((x, y) =>
      x.toLowerCase().localeCompare(y.toLowerCase()),
    );
  }

  const fromBlock = resolveOperatorRegistryFromBlock(opts);
  const logs = await publicClient.getLogs({
    address: registryAddress,
    event: nodeRegisteredEvent,
    fromBlock,
    toBlock: "latest",
  });

  const operators = new Map<string, Address>();
  for (const log of logs) {
    const o = log.args.operator;
    if (o === undefined) continue;
    const a = getAddress(o as Address);
    operators.set(a.toLowerCase(), a);
  }
  return [...operators.values()].sort((x, y) =>
    x.toLowerCase().localeCompare(y.toLowerCase()),
  );
}

/**
 * Directory rows: per-operator node counts and simple aggregates from current `NodeInfo`.
 * Node membership is taken from `operatorNodes(operator)` (authoritative on-chain).
 */
export async function getOperatorDirectoryEntries(
  publicClient: PublicClient,
  registryAddress: Address,
  opts?: { fromBlock?: bigint },
): Promise<OperatorDirectoryEntry[]> {
  const addresses = await getRegisteredOperatorAddresses(
    publicClient,
    registryAddress,
    opts,
  );
  const out: OperatorDirectoryEntry[] = [];

  for (const operator of addresses) {
    const nodeIds = await getOperatorNodes(
      publicClient,
      registryAddress,
      operator,
    );
    let activeRegisteredNodeCount = 0;
    let teeCapableNodeCount = 0;

    for (const nodeId of nodeIds) {
      const info = await getNode(publicClient, registryAddress, nodeId);
      const registered =
        info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
      if (
        registered &&
        info.lifecycle === NodeLifecycle.Active &&
        info.active
      ) {
        activeRegisteredNodeCount += 1;
      }
      if (info.supportsTEE) teeCapableNodeCount += 1;
    }

    out.push({
      operator,
      nodeCount: nodeIds.length,
      activeRegisteredNodeCount,
      teeCapableNodeCount,
    });
  }

  return out;
}

/**
 * All nodes for `operator` (for detail UI).
 */
export async function getOperatorNodeDetailRows(
  publicClient: PublicClient,
  registryAddress: Address,
  operator: Address,
): Promise<OperatorNodeDetailRow[]> {
  const nodeIds = await getOperatorNodes(
    publicClient,
    registryAddress,
    getAddress(operator),
  );

  const rows: OperatorNodeDetailRow[] = [];
  for (const nodeId of nodeIds) {
    const info = await getNode(publicClient, registryAddress, nodeId);
    rows.push({ nodeId, info });
  }

  return rows.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

/**
 * Node IDs (`bytes32`) registered by `operator` (wraps `operatorNodes` on the registry).
 */
export async function getOperatorNodes(
  publicClient: PublicClient,
  registryAddress: Address,
  operator: Address,
): Promise<Hex[]> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "operatorNodes",
    args: [getAddress(operator)],
  });
  return raw as Hex[];
}

export async function registerNode(
  walletClient: WalletClient,
  publicClient: PublicClient,
  registryAddress: Address,
  params: {
    nodeId: Hex;
    payout: Address;
    supportsBestEffort: boolean;
    supportsTEE: boolean;
    metadataURI: string;
    /** X25519 pubkey as bytes32; `zeroHash` opts out (on-chain encryption key v1). */
    initialEncryptionPubkey?: Hex;
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

  const args = [
    params.nodeId,
    params.payout,
    params.supportsBestEffort,
    params.supportsTEE,
    params.metadataURI,
    params.initialEncryptionPubkey ?? zeroHash,
  ] as const;

  await publicClient.simulateContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "registerNode",
    args,
    account,
  });

  const data = encodeFunctionData({
    abi: operatorRegistryAbi,
    functionName: "registerNode",
    args,
  });

  try {
    return await walletClient.writeContract({
      address: registryAddress,
      abi: operatorRegistryAbi,
      functionName: "registerNode",
      args,
      account,
      chain,
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
      to: registryAddress,
      data,
    });

    try {
      return await walletClient.sendTransaction({
        account,
        chain,
        to: registryAddress,
        data,
      });
    } catch {
      return sendViaInjectedProvider({
        from: account.address,
        to: registryAddress,
        data,
        gas: prepared.gas,
        maxFeePerGas: prepared.maxFeePerGas,
        maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
        gasPrice: prepared.gasPrice,
      });
    }
  }
}

export async function setNodePayout(
  walletClient: WalletClient,
  registryAddress: Address,
  nodeId: Hex,
  newPayout: Address,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return walletClient.writeContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "setNodePayout",
    args: [nodeId, getAddress(newPayout)],
    account,
    chain,
  });
}

export async function setNodeActive(
  walletClient: WalletClient,
  registryAddress: Address,
  nodeId: Hex,
  active: boolean,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return walletClient.writeContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "setNodeActive",
    args: [nodeId, active],
    account,
    chain,
  });
}

export async function setNodeMetadata(
  walletClient: WalletClient,
  registryAddress: Address,
  nodeId: Hex,
  uri: string,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return walletClient.writeContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "setNodeMetadata",
    args: [nodeId, uri],
    account,
    chain,
  });
}

function walletSignerAddress(
  account: NonNullable<WalletClient["account"]>,
): Address {
  if (typeof account === "object" && account !== null && "address" in account) {
    return getAddress((account as { address: Address }).address);
  }
  if (typeof account === "string") return getAddress(account as Address);
  throw new Error("Wallet account address unavailable");
}

/**
 * Operator preconditions (`nodeOperator`, `operatorNodes` membership) used before state-changing calls.
 *
 * @returns Current on-chain **`NodeInfo`** via {@link getNode}.
 */
export async function assertOperatorForNode(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Hex,
  signerAddress: Address,
): Promise<NodeInfo> {
  const assigned = await publicClient.readContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "nodeOperator",
    args: [nodeId],
  });
  const opOnChain = getAddress(assigned as Address);
  const me = getAddress(signerAddress);
  if (opOnChain.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    throw new Error(
      "This node id has no operator on-chain (never registered, or cleared after purge). Refresh the page.",
    );
  }
  if (me.toLowerCase() !== opOnChain.toLowerCase()) {
    throw new Error(
      `Your wallet (${me}) is not the on-chain operator. Operator is ${opOnChain}. Switch to that account in your wallet.`,
    );
  }
  const ids = (await publicClient.readContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "operatorNodes",
    args: [me],
  })) as Hex[];
  const found = ids.some((id) => id.toLowerCase() === nodeId.toLowerCase());
  if (!found) {
    throw new Error(
      "This node id is not in your operatorNodes list, so the contract would revert with NodeNotRegistered. Try refreshing; if the page still shows you as operator, RPC or registry state may not match what your wallet uses.",
    );
  }
  return getNode(publicClient, registryAddress, nodeId);
}

/**
 * Validates **`chillNode`**: signer is operator and lifecycle is **Active**.
 */
export async function assertCanChill(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Hex,
  signerAddress: Address,
): Promise<void> {
  const info = await assertOperatorForNode(
    publicClient,
    registryAddress,
    nodeId,
    signerAddress,
  );
  if (info.lifecycle !== NodeLifecycle.Active) {
    throw new Error(
      `Chill only applies while lifecycle is Active (current: ${lifecycleLabel(info.lifecycle)}). For terminal rundown, chill first — then settle open sessions — then use “Mark defunct”.`,
    );
  }
}

/**
 * Validates **`markDefunct`**: operator, lifecycle **Chilled**, and escrow **`openSessionCountByNode` == 0**.
 */
export async function assertCanMarkDefunct(
  publicClient: PublicClient,
  registryAddress: Address,
  escrowAddress: Address,
  nodeId: Hex,
  signerAddress: Address,
): Promise<void> {
  const info = await assertOperatorForNode(
    publicClient,
    registryAddress,
    nodeId,
    signerAddress,
  );
  if (info.lifecycle !== NodeLifecycle.Chilled) {
    throw new Error(
      `Mark defunct requires lifecycle Chilled (current: ${lifecycleLabel(info.lifecycle)}). Run “Chill node” first, then settle remaining escrow sessions until the open-session count reaches zero.`,
    );
  }
  const open = await readOpenSessionCount(
    publicClient,
    escrowAddress,
    nodeId,
  );
  if (open !== 0n) {
    throw new Error(
      `Settlement escrow still reports ${open.toString()} open session(s). Wait until they are fully settled so the on-chain counter reaches zero.`,
    );
  }
}

/** Human-readable **`NodeLifecycle`** for errors and UI snippets. */
export function lifecycleLabel(l: NodeLifecycle): string {
  if (l === NodeLifecycle.Chilled) return "Chilled";
  if (l === NodeLifecycle.Defunct) return "Defunct";
  return "Active";
}

export async function chillNode(
  walletClient: WalletClient,
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Hex,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  const signerAddress = walletSignerAddress(account);
  const rpcChainId = publicClient.chain?.id;
  if (rpcChainId !== undefined && rpcChainId !== chain.id) {
    throw new Error(
      `Wallet reports chain ${chain.id} but the app RPC is on chain ${rpcChainId}. Switch your wallet to the hub chain (id ${rpcChainId}) and try again.`,
    );
  }

  await assertCanChill(
    publicClient,
    registryAddress,
    nodeId,
    signerAddress,
  );

  await publicClient.simulateContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "chillNode",
    args: [nodeId],
    account,
  });

  return walletClient.writeContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "chillNode",
    args: [nodeId],
    account,
    chain,
  });
}

export async function markDefunct(
  walletClient: WalletClient,
  publicClient: PublicClient,
  registryAddress: Address,
  escrowAddress: Address,
  nodeId: Hex,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  const signerAddress = walletSignerAddress(account);
  const rpcChainId = publicClient.chain?.id;
  if (rpcChainId !== undefined && rpcChainId !== chain.id) {
    throw new Error(
      `Wallet reports chain ${chain.id} but the app RPC is on chain ${rpcChainId}. Switch your wallet to the hub chain (id ${rpcChainId}) and try again.`,
    );
  }

  await assertCanMarkDefunct(
    publicClient,
    registryAddress,
    escrowAddress,
    nodeId,
    signerAddress,
  );

  await publicClient.simulateContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "markDefunct",
    args: [nodeId],
    account,
  });

  return walletClient.writeContract({
    address: registryAddress,
    abi: operatorRegistryAbi,
    functionName: "markDefunct",
    args: [nodeId],
    account,
    chain,
  });
}

/**
 * Lists registered nodes via `NodeRegistered` logs, or via
 * `NEXT_PUBLIC_DEV_PROVIDER_ADDRESSES` (comma-separated 32-byte node IDs, or
 * 20-byte addresses padded like `parseNodeIdInput`) for local shortcuts.
 *
 * Each row is **`{ nodeId, info }`** where **`info`** is {@link NodeInfo}.
 */
/**
 * Resolve a sparkl-solo software `mock-…` peer id to on-chain `bytes32` by scanning
 * registered nodes' `metadataURI` JSON (`peer_id` field).
 */
export async function findNodeIdBySoftwarePeerId(
  publicClient: PublicClient,
  registryAddress: Address,
  softwarePeerId: string,
  opts?: { fromBlock?: bigint },
): Promise<Hex | null> {
  const want = softwarePeerId.trim().toLowerCase();
  if (!want) return null;
  const nodes = await getAllRegisteredNodes(publicClient, registryAddress, opts);
  for (const { nodeId, info } of nodes) {
    const peer = softwarePeerIdFromMetadataUri(info.metadataURI ?? "");
    if (peer && peer.toLowerCase() === want) return nodeId;
  }
  return null;
}

export async function getAllRegisteredNodes(
  publicClient: PublicClient,
  registryAddress: Address,
  opts?: { fromBlock?: bigint },
): Promise<RegisteredNode[]> {
  const rawList =
    process.env.NEXT_PUBLIC_DEV_OPERATOR_NODE_ADDRESSES ??
    process.env.NEXT_PUBLIC_DEV_PROVIDER_ADDRESSES;
  if (rawList?.trim()) {
    const ids = rawList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((a) => parseNodeIdInput(a))
      .filter((x): x is Hex => Boolean(x));
    const infos = await Promise.all(
      ids.map((id) => getNode(publicClient, registryAddress, id)),
    );
    return ids.map((nodeId, i) => ({ nodeId, info: infos[i] }));
  }

  const fromBlock = resolveOperatorRegistryFromBlock(opts);

  const logs = await publicClient.getLogs({
    address: registryAddress,
    event: nodeRegisteredEvent,
    fromBlock,
    toBlock: "latest",
  });

  const unique = new Map<string, Hex>();
  for (const log of logs) {
    const id = log.args.nodeId;
    if (id === undefined) continue;
    const h = id as Hex;
    unique.set(h.toLowerCase(), h);
  }

  const nodeIds = [...unique.values()];
  const infos = await Promise.all(
    nodeIds.map((id) => getNode(publicClient, registryAddress, id)),
  );
  return nodeIds.map((nodeId, i) => ({ nodeId, info: infos[i] }));
}

/** A registered node with its current on-chain operator (from {@link getNodeOperator}). */
export type RegisteredNodeWithOperator = {
  nodeId: Hex;
  info: NodeInfo;
  operator: Address;
};

/**
 * All nodes in the registry (same discovery as {@link getAllRegisteredNodes}), each with
 * its operator address for display and filtering.
 */
export async function getRegisteredNodesWithOperators(
  publicClient: PublicClient,
  registryAddress: Address,
  opts?: { fromBlock?: bigint },
): Promise<RegisteredNodeWithOperator[]> {
  const nodes = await getAllRegisteredNodes(publicClient, registryAddress, opts);
  const rows = await Promise.all(
    nodes.map(async ({ nodeId, info }) => ({
      nodeId,
      info,
      operator: await getNodeOperator(publicClient, registryAddress, nodeId),
    })),
  );
  return rows.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

/**
 * Nodes tied to `account`: wallet is the on-chain operator for the node, or the node's payout address.
 */
export async function getNodesLinkedToAccount(
  publicClient: PublicClient,
  registryAddress: Address,
  account: Address,
  opts?: { fromBlock?: bigint },
): Promise<RegisteredNode[]> {
  const all = await getAllRegisteredNodes(publicClient, registryAddress, opts);
  const acc = account.toLowerCase();
  const linked: RegisteredNode[] = [];
  for (const row of all) {
    const { nodeId, info } = row;
    const registered =
      info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
    if (!registered) continue;
    const operator = (
      await getNodeOperator(publicClient, registryAddress, nodeId)
    ).toLowerCase();
    if (operator === acc || info.payout.toLowerCase() === acc) {
      linked.push(row);
    }
  }
  return linked.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function normalizeLifecycle(raw: unknown): NodeLifecycle {
  const n =
    typeof raw === "bigint"
      ? Number(raw)
      : typeof raw === "number"
        ? raw
        : NaN;
  if (
    n === NodeLifecycle.Active ||
    n === NodeLifecycle.Chilled ||
    n === NodeLifecycle.Defunct
  ) {
    return n;
  }
  return NodeLifecycle.Active;
}

/** Maps raw `getProvider` / on-chain **`NodeInfo`** (tuple or struct object) to {@link NodeInfo}. */
function normalizeNodeInfo(row: unknown): NodeInfo {
  if (Array.isArray(row)) {
    return {
      payout: getAddress(row[0] as Address),
      feeBps: Number(row[1]),
      active: Boolean(row[2]),
      supportsBestEffort: Boolean(row[3]),
      supportsTEE: Boolean(row[4]),
      teeReportHash: row[5] as `0x${string}`,
      metadataURI: typeof row[6] === "string" ? row[6] : "",
      lifecycle: normalizeLifecycle(row[7]),
    };
  }
  const o = row as {
    payout: Address;
    feeBps: bigint | number;
    active: boolean;
    supportsBestEffort: boolean;
    supportsTEE: boolean;
    teeReportHash: `0x${string}`;
    metadataURI: string;
    lifecycle?: bigint | number;
  };
  return {
    payout: getAddress(o.payout),
    feeBps: Number(o.feeBps),
    active: o.active,
    supportsBestEffort: o.supportsBestEffort,
    supportsTEE: o.supportsTEE,
    teeReportHash: o.teeReportHash,
    metadataURI: o.metadataURI ?? "",
    lifecycle: normalizeLifecycle(o.lifecycle ?? NodeLifecycle.Active),
  };
}
