import { defineChain, type Chain } from "viem";

export type ChainEnv = "assethub-dev-stub" | "paseo" | "polkadot";

function envSuffix(chainEnv: ChainEnv): string {
  switch (chainEnv) {
    case "assethub-dev-stub":
      return "ASSHUB_DEV_STUB";
    case "paseo":
      return "PASEO";
    case "polkadot":
      return "POLKADOT";
  }
}

function readEnv(key: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function getActiveChainEnv(): ChainEnv {
  const v = readEnv("NEXT_PUBLIC_CHAIN_ENV");
  if (v === "assethub-dev-stub" || v === "paseo" || v === "polkadot") return v;
  return "assethub-dev-stub";
}

export type HubChainConfig = {
  chainEnv: ChainEnv;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  providerRegistryAddress: `0x${string}`;
  settlementEscrowAddress: `0x${string}`;
};

const STUB_DEFAULTS = {
  rpcUrl: "http://127.0.0.1:8545",
  chainId: 31337,
  chainName: "Anvil local",
} as const;

/**
 * Resolved Hub EVM settings for the active `NEXT_PUBLIC_CHAIN_ENV`.
 * Requires contract addresses for the active profile; falls back RPC/chain id only for `assethub-dev-stub`.
 */
export function getActiveChainConfig(): HubChainConfig {
  const chainEnv = getActiveChainEnv();
  const suf = envSuffix(chainEnv);

  let rpcUrl = readEnv(`NEXT_PUBLIC_RPC_URL_${suf}`);
  let chainIdRaw = readEnv(`NEXT_PUBLIC_CHAIN_ID_${suf}`);
  let chainName: string;

  if (chainEnv === "assethub-dev-stub") {
    chainName = STUB_DEFAULTS.chainName;
    rpcUrl = rpcUrl ?? STUB_DEFAULTS.rpcUrl;
    chainIdRaw = chainIdRaw ?? String(STUB_DEFAULTS.chainId);
  } else if (chainEnv === "paseo") {
    chainName = "Paseo Hub EVM";
    if (!rpcUrl) throw new Error(`NEXT_PUBLIC_RPC_URL_${suf} is required for chain env ${chainEnv}`);
    if (!chainIdRaw) throw new Error(`NEXT_PUBLIC_CHAIN_ID_${suf} is required for chain env ${chainEnv}`);
  } else {
    chainName = "Asset Hub Polkadot";
    if (!rpcUrl) throw new Error(`NEXT_PUBLIC_RPC_URL_${suf} is required for chain env ${chainEnv}`);
    if (!chainIdRaw) throw new Error(`NEXT_PUBLIC_CHAIN_ID_${suf} is required for chain env ${chainEnv}`);
  }

  const chainId = Number(chainIdRaw);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error(`Invalid NEXT_PUBLIC_CHAIN_ID_${suf}: ${chainIdRaw}`);
  }

  const providerRegistryAddress = readEnv(`NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_${suf}`);
  const settlementEscrowAddress = readEnv(`NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_${suf}`);

  if (!providerRegistryAddress?.startsWith("0x")) {
    throw new Error(`NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_${suf} must be a 0x-prefixed address`);
  }
  if (!settlementEscrowAddress?.startsWith("0x")) {
    throw new Error(`NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_${suf} must be a 0x-prefixed address`);
  }

  return {
    chainEnv,
    chainId,
    chainName,
    rpcUrl,
    providerRegistryAddress: providerRegistryAddress as `0x${string}`,
    settlementEscrowAddress: settlementEscrowAddress as `0x${string}`,
  };
}

/** viem `Chain` for wagmi (native DOT shown with 10 decimals on Hub). */
export function hubChainFromConfig(cfg: HubChainConfig): Chain {
  return defineChain({
    id: cfg.chainId,
    name: cfg.chainName,
    nativeCurrency: {
      decimals: 10,
      name: "DOT",
      symbol: "DOT",
    },
    rpcUrls: {
      default: { http: [cfg.rpcUrl] },
    },
  });
}
