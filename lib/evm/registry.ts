import {
  type Address,
  type PublicClient,
  type WalletClient,
  getAddress,
  parseAbiItem,
} from "viem";

import { providerRegistryAbi } from "@/lib/abi";
import { ZERO_ADDRESS } from "@/lib/chains";
import { type ProviderInfo, type RegisteredProvider, SecurityTier } from "@/lib/types";

const nodeRegisteredEvent = parseAbiItem(
  "event NodeRegistered(address indexed nodeId, address indexed operator, string metadataURI)",
);

export async function getProvider(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Address,
): Promise<ProviderInfo> {
  const row = await publicClient.readContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "getProvider",
    args: [nodeId],
  });
  return normalizeProviderInfo(row);
}

export async function getNodeOperator(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Address,
): Promise<Address> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "nodeOperator",
    args: [nodeId],
  });
  return getAddress(raw as Address);
}

export async function getMetadataURI(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Address,
): Promise<string> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "getMetadataURI",
    args: [nodeId],
  });
  return raw as string;
}

export async function supportsTier(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Address,
  tier: SecurityTier,
): Promise<boolean> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "supportsTier",
    args: [nodeId, tier],
  });
  return raw as boolean;
}

export async function getPricePer1k(
  publicClient: PublicClient,
  registryAddress: Address,
  nodeId: Address,
  tier: SecurityTier,
): Promise<bigint> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "getPricePer1k",
    args: [nodeId, tier],
  });
  return raw as bigint;
}

export async function registerNode(
  walletClient: WalletClient,
  registryAddress: Address,
  params: {
    nodeId: Address;
    payout: Address;
    supportsBestEffort: boolean;
    supportsTEE: boolean;
    metadataURI: string;
  },
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return walletClient.writeContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "registerNode",
    args: [
      params.nodeId,
      params.payout,
      params.supportsBestEffort,
      params.supportsTEE,
      params.metadataURI,
    ],
    account,
    chain,
  });
}

export async function setNodePricing(
  walletClient: WalletClient,
  registryAddress: Address,
  nodeId: Address,
  tier: SecurityTier,
  pricePer1kTokensInternal: bigint,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return walletClient.writeContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "setNodePricing",
    args: [nodeId, tier, pricePer1kTokensInternal],
    account,
    chain,
  });
}

export async function setNodePayout(
  walletClient: WalletClient,
  registryAddress: Address,
  nodeId: Address,
  newPayout: Address,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return walletClient.writeContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "setNodePayout",
    args: [nodeId, getAddress(newPayout)],
    account,
    chain,
  });
}

export async function setNodeActive(
  walletClient: WalletClient,
  registryAddress: Address,
  nodeId: Address,
  active: boolean,
): Promise<`0x${string}`> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet account unavailable");
  const chain = walletClient.chain;
  if (!chain) throw new Error("Wallet chain unavailable");

  return walletClient.writeContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "setNodeActive",
    args: [nodeId, active],
    account,
    chain,
  });
}

/**
 * Lists registered nodes via `NodeRegistered` logs, or via
 * `NEXT_PUBLIC_DEV_PROVIDER_ADDRESSES` (comma-separated node IDs) for local shortcuts.
 */
export async function getAllProviders(
  publicClient: PublicClient,
  registryAddress: Address,
  opts?: { fromBlock?: bigint },
): Promise<RegisteredProvider[]> {
  const rawList = process.env.NEXT_PUBLIC_DEV_PROVIDER_ADDRESSES;
  if (rawList?.trim()) {
    const addrs = rawList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((a) => getAddress(a as Address));
    const infos = await Promise.all(
      addrs.map((a) => getProvider(publicClient, registryAddress, a)),
    );
    return addrs.map((address, i) => ({ address, info: infos[i] }));
  }

  const fromBlockEnv = process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_FROM_BLOCK;
  const fromBlock = opts?.fromBlock ?? (fromBlockEnv ? BigInt(fromBlockEnv) : 0n);

  const logs = await publicClient.getLogs({
    address: registryAddress,
    event: nodeRegisteredEvent,
    fromBlock,
    toBlock: "latest",
  });

  const unique = new Map<Address, true>();
  for (const log of logs) {
    const addr = log.args.nodeId;
    if (!addr) continue;
    unique.set(getAddress(addr), true);
  }

  const addresses = [...unique.keys()];
  const infos = await Promise.all(
    addresses.map((a) => getProvider(publicClient, registryAddress, a)),
  );
  return addresses.map((address, i) => ({ address, info: infos[i] }));
}

/**
 * Nodes tied to `account`: wallet is the on-chain operator for the node, or the node's payout address.
 */
export async function getProvidersLinkedToAccount(
  publicClient: PublicClient,
  registryAddress: Address,
  account: Address,
  opts?: { fromBlock?: bigint },
): Promise<RegisteredProvider[]> {
  const all = await getAllProviders(publicClient, registryAddress, opts);
  const acc = account.toLowerCase();
  const linked: RegisteredProvider[] = [];
  for (const row of all) {
    const { address: nodeId, info } = row;
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
  return linked.sort((a, b) => a.address.localeCompare(b.address));
}

function normalizeProviderInfo(row: unknown): ProviderInfo {
  if (Array.isArray(row)) {
    return {
      payout: getAddress(row[0] as Address),
      feeBps: Number(row[1]),
      active: Boolean(row[2]),
      supportsBestEffort: Boolean(row[3]),
      supportsTEE: Boolean(row[4]),
      teeReportHash: row[5] as `0x${string}`,
      metadataURI: typeof row[6] === "string" ? row[6] : "",
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
  };
  return {
    payout: getAddress(o.payout),
    feeBps: Number(o.feeBps),
    active: o.active,
    supportsBestEffort: o.supportsBestEffort,
    supportsTEE: o.supportsTEE,
    teeReportHash: o.teeReportHash,
    metadataURI: o.metadataURI ?? "",
  };
}
