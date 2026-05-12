import {
  type Address,
  type PublicClient,
  type WalletClient,
  getAddress,
  parseAbiItem,
} from "viem";

import { providerRegistryAbi } from "@/lib/abi";
import { type ProviderInfo, type RegisteredProvider, SecurityTier } from "@/lib/types";

const providerRegisteredEvent = parseAbiItem(
  "event ProviderRegistered(address indexed provider, address payout, bool supportsBestEffort, bool supportsTEE, string metadataURI)",
);

export async function getProvider(
  publicClient: PublicClient,
  registryAddress: Address,
  provider: Address,
): Promise<ProviderInfo> {
  const row = await publicClient.readContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "getProvider",
    args: [provider],
  });
  return normalizeProviderInfo(row);
}

export async function getMetadataURI(
  publicClient: PublicClient,
  registryAddress: Address,
  provider: Address,
): Promise<string> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "getMetadataURI",
    args: [provider],
  });
  return raw as string;
}

export async function supportsTier(
  publicClient: PublicClient,
  registryAddress: Address,
  provider: Address,
  tier: SecurityTier,
): Promise<boolean> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "supportsTier",
    args: [provider, tier],
  });
  return raw as boolean;
}

export async function getPricePer1k(
  publicClient: PublicClient,
  registryAddress: Address,
  provider: Address,
  tier: SecurityTier,
): Promise<bigint> {
  const raw = await publicClient.readContract({
    address: registryAddress,
    abi: providerRegistryAbi,
    functionName: "getPricePer1k",
    args: [provider, tier],
  });
  return raw as bigint;
}

export async function registerProvider(
  walletClient: WalletClient,
  registryAddress: Address,
  params: {
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
    functionName: "registerProvider",
    args: [
      params.payout,
      params.supportsBestEffort,
      params.supportsTEE,
      params.metadataURI,
    ],
    account,
    chain,
  });
}

export async function setPricing(
  walletClient: WalletClient,
  registryAddress: Address,
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
    functionName: "setPricing",
    args: [tier, pricePer1kTokensInternal],
    account,
    chain,
  });
}

/**
 * Lists registered providers via `ProviderRegistered` logs, or via
 * `NEXT_PUBLIC_DEV_PROVIDER_ADDRESSES` (comma-separated) for local shortcuts.
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
    event: providerRegisteredEvent,
    fromBlock,
    toBlock: "latest",
  });

  const unique = new Map<Address, true>();
  for (const log of logs) {
    const addr = log.args.provider;
    if (!addr) continue;
    unique.set(getAddress(addr), true);
  }

  const addresses = [...unique.keys()];
  const infos = await Promise.all(
    addresses.map((a) => getProvider(publicClient, registryAddress, a)),
  );
  return addresses.map((address, i) => ({ address, info: infos[i] }));
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
    };
  }
  const o = row as {
    payout: Address;
    feeBps: bigint | number;
    active: boolean;
    supportsBestEffort: boolean;
    supportsTEE: boolean;
    teeReportHash: `0x${string}`;
  };
  return {
    payout: getAddress(o.payout),
    feeBps: Number(o.feeBps),
    active: o.active,
    supportsBestEffort: o.supportsBestEffort,
    supportsTEE: o.supportsTEE,
    teeReportHash: o.teeReportHash,
  };
}
