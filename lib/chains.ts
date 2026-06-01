import { defineChain, type Chain } from "viem";

export type ChainEnv = "assethub-dev-stub" | "paseo" | "polkadot";

/**
 * Trim env values. Call sites must pass **static** `process.env.NEXT_PUBLIC_*`
 * identifiers — Next.js only inlines those at build time; dynamic `process.env[key]`
 * stays empty in the browser bundle.
 */
function trimEnv(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

/** Burn / unset placeholder — not a deployed contract; do not call depositDot here. */
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

/** Avoid spamming the console when many hooks/modules call `getActiveChainConfig`. */
let warnedStubRegistryFallback = false;
let warnedStubEscrowFallback = false;
let warnedStubModelOracleFallback = false;

function isValidEthAddress(v: string | undefined): v is `0x${string}` {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}

/** Must match `SettlementEscrow.nativeDotDecimals` and the wallet’s saved network metadata. */
const MAX_NATIVE_DECIMALS = 18;

function parseEnvNativeDecimals(
  raw: string | undefined,
  fallback: number,
): number {
  const t = trimEnv(raw);
  if (t === undefined) return fallback;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1 || n > MAX_NATIVE_DECIMALS) {
    throw new Error(
      `Native decimals must be an integer in [1, ${MAX_NATIVE_DECIMALS}], got ${JSON.stringify(raw)}`,
    );
  }
  return n;
}

export type HubNativeCurrency = {
  decimals: number;
  symbol: string;
  name: string;
};

function hubNativeCurrencyForEnv(chainEnv: ChainEnv): HubNativeCurrency {
  if (chainEnv === "assethub-dev-stub") {
    return {
      decimals: parseEnvNativeDecimals(
        process.env.NEXT_PUBLIC_NATIVE_DECIMALS_ASSHUB_DEV_STUB,
        18,
      ),
      symbol:
        trimEnv(process.env.NEXT_PUBLIC_NATIVE_SYMBOL_ASSHUB_DEV_STUB) ?? "ETH",
      name:
        trimEnv(process.env.NEXT_PUBLIC_NATIVE_NAME_ASSHUB_DEV_STUB) ?? "Ether",
    };
  }
  if (chainEnv === "paseo") {
    return {
      decimals: parseEnvNativeDecimals(
        process.env.NEXT_PUBLIC_NATIVE_DECIMALS_PASEO,
        10,
      ),
      symbol: trimEnv(process.env.NEXT_PUBLIC_NATIVE_SYMBOL_PASEO) ?? "DOT",
      name: trimEnv(process.env.NEXT_PUBLIC_NATIVE_NAME_PASEO) ?? "DOT",
    };
  }
  return {
    decimals: parseEnvNativeDecimals(
      process.env.NEXT_PUBLIC_NATIVE_DECIMALS_POLKADOT,
      10,
    ),
    symbol: trimEnv(process.env.NEXT_PUBLIC_NATIVE_SYMBOL_POLKADOT) ?? "DOT",
    name: trimEnv(process.env.NEXT_PUBLIC_NATIVE_NAME_POLKADOT) ?? "DOT",
  };
}

export function getActiveChainEnv(): ChainEnv {
  const v = trimEnv(process.env.NEXT_PUBLIC_CHAIN_ENV);
  if (v === "assethub-dev-stub" || v === "paseo" || v === "polkadot") return v;
  return "assethub-dev-stub";
}

export type HubChainConfig = {
  chainEnv: ChainEnv;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  /** Native gas token as shown in the wallet (`wallet_addEthereumChain` / viem `Chain`). */
  nativeCurrency: HubNativeCurrency;
  operatorRegistryAddress: `0x${string}`;
  settlementEscrowAddress: `0x${string}`;
  modelPriceOracleAddress: `0x${string}`;
};

const STUB_DEFAULTS = {
  rpcUrl: "http://127.0.0.1:8545",
  chainId: 31337,
  chainName: "Anvil local",
} as const;

/**
 * Resolved Hub EVM settings for the active `NEXT_PUBLIC_CHAIN_ENV`.
 * For `assethub-dev-stub`, RPC/chain id and missing or malformed contract addresses fall back to local defaults (`0x0000…0000` placeholders until deploy).
 * Native currency metadata defaults to stub **ETH / 18 decimals** and Hub **DOT / 10**; override with **`NEXT_PUBLIC_NATIVE_*`** (see `.env.example`).
 * Other profiles require RPC, chain id, and valid contract addresses.
 */
export function getActiveChainConfig(): HubChainConfig {
  const chainEnv = getActiveChainEnv();

  let rpcUrl: string | undefined;
  let chainIdRaw: string | undefined;
  let chainName: string;
  let operatorRegistryRaw: string | undefined;
  let settlementEscrowRaw: string | undefined;
  let modelPriceOracleRaw: string | undefined;

  if (chainEnv === "assethub-dev-stub") {
    chainName =
      trimEnv(process.env.NEXT_PUBLIC_CHAIN_NAME_ASSHUB_DEV_STUB) ??
      STUB_DEFAULTS.chainName;
    rpcUrl =
      trimEnv(process.env.NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB) ??
      STUB_DEFAULTS.rpcUrl;
    chainIdRaw =
      trimEnv(process.env.NEXT_PUBLIC_CHAIN_ID_ASSHUB_DEV_STUB) ??
      String(STUB_DEFAULTS.chainId);
    operatorRegistryRaw = trimEnv(
      process.env.NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_ASSHUB_DEV_STUB ??
        process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_ASSHUB_DEV_STUB,
    );
    settlementEscrowRaw = trimEnv(
      process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_ASSHUB_DEV_STUB,
    );
    modelPriceOracleRaw = trimEnv(
      process.env.NEXT_PUBLIC_MODEL_PRICE_ORACLE_ADDRESS_ASSHUB_DEV_STUB,
    );
  } else if (chainEnv === "paseo") {
    chainName = "Paseo Hub EVM";
    rpcUrl = trimEnv(process.env.NEXT_PUBLIC_RPC_URL_PASEO);
    chainIdRaw = trimEnv(process.env.NEXT_PUBLIC_CHAIN_ID_PASEO);
    operatorRegistryRaw = trimEnv(
      process.env.NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_PASEO ??
        process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_PASEO,
    );
    settlementEscrowRaw = trimEnv(
      process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_PASEO,
    );
    modelPriceOracleRaw = trimEnv(
      process.env.NEXT_PUBLIC_MODEL_PRICE_ORACLE_ADDRESS_PASEO,
    );
    if (!rpcUrl)
      throw new Error(
        "NEXT_PUBLIC_RPC_URL_PASEO is required for chain env paseo",
      );
    if (!chainIdRaw)
      throw new Error(
        "NEXT_PUBLIC_CHAIN_ID_PASEO is required for chain env paseo",
      );
  } else {
    chainName = "Asset Hub Polkadot";
    rpcUrl = trimEnv(process.env.NEXT_PUBLIC_RPC_URL_POLKADOT);
    chainIdRaw = trimEnv(process.env.NEXT_PUBLIC_CHAIN_ID_POLKADOT);
    operatorRegistryRaw = trimEnv(
      process.env.NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_POLKADOT ??
        process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_POLKADOT,
    );
    settlementEscrowRaw = trimEnv(
      process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_POLKADOT,
    );
    modelPriceOracleRaw = trimEnv(
      process.env.NEXT_PUBLIC_MODEL_PRICE_ORACLE_ADDRESS_POLKADOT,
    );
    if (!rpcUrl)
      throw new Error(
        "NEXT_PUBLIC_RPC_URL_POLKADOT is required for chain env polkadot",
      );
    if (!chainIdRaw)
      throw new Error(
        "NEXT_PUBLIC_CHAIN_ID_POLKADOT is required for chain env polkadot",
      );
  }

  const chainId = Number(chainIdRaw);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error(`Invalid chain id for env ${chainEnv}: ${chainIdRaw}`);
  }

  let operatorRegistryAddress: `0x${string}`;
  let settlementEscrowAddress: `0x${string}`;
  let modelPriceOracleAddress: `0x${string}`;

  if (chainEnv === "assethub-dev-stub") {
    if (!isValidEthAddress(operatorRegistryRaw)) {
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV === "development" &&
        !warnedStubRegistryFallback
      ) {
        warnedStubRegistryFallback = true;
        console.warn(
          `[chains] NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_ASSHUB_DEV_STUB missing or invalid; using ${ZERO_ADDRESS} for local stub.`,
        );
      }
      operatorRegistryAddress = ZERO_ADDRESS;
    } else {
      operatorRegistryAddress = operatorRegistryRaw;
    }
    if (!isValidEthAddress(settlementEscrowRaw)) {
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV === "development" &&
        !warnedStubEscrowFallback
      ) {
        warnedStubEscrowFallback = true;
        console.warn(
          `[chains] NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_ASSHUB_DEV_STUB missing or invalid; using ${ZERO_ADDRESS} for local stub.`,
        );
      }
      settlementEscrowAddress = ZERO_ADDRESS;
    } else {
      settlementEscrowAddress = settlementEscrowRaw;
    }
    if (!isValidEthAddress(modelPriceOracleRaw)) {
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV === "development" &&
        !warnedStubModelOracleFallback
      ) {
        warnedStubModelOracleFallback = true;
        console.warn(
          `[chains] NEXT_PUBLIC_MODEL_PRICE_ORACLE_ADDRESS_ASSHUB_DEV_STUB missing or invalid; using ${ZERO_ADDRESS} for local stub.`,
        );
      }
      modelPriceOracleAddress = ZERO_ADDRESS;
    } else {
      modelPriceOracleAddress = modelPriceOracleRaw;
    }
  } else {
    if (!isValidEthAddress(operatorRegistryRaw)) {
      throw new Error(
        chainEnv === "paseo"
          ? "NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_PASEO must be a valid 0x-prefixed 20-byte hex address"
          : "NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_POLKADOT must be a valid 0x-prefixed 20-byte hex address",
      );
    }
    if (!isValidEthAddress(settlementEscrowRaw)) {
      throw new Error(
        chainEnv === "paseo"
          ? "NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_PASEO must be a valid 0x-prefixed 20-byte hex address"
          : "NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_POLKADOT must be a valid 0x-prefixed 20-byte hex address",
      );
    }
    operatorRegistryAddress = operatorRegistryRaw;
    settlementEscrowAddress = settlementEscrowRaw;
    if (!isValidEthAddress(modelPriceOracleRaw)) {
      modelPriceOracleAddress = ZERO_ADDRESS;
    } else {
      modelPriceOracleAddress = modelPriceOracleRaw;
    }
  }

  const nativeCurrency = hubNativeCurrencyForEnv(chainEnv);

  return {
    chainEnv,
    chainId,
    chainName,
    rpcUrl,
    nativeCurrency,
    operatorRegistryAddress,
    settlementEscrowAddress,
    modelPriceOracleAddress,
  };
}

function readSameOriginProxyEnv(): boolean | undefined {
  const v = trimEnv(process.env.NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY);
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return undefined;
}

let warnedPublicRpcProxySkipped = false;

/** Public HTTPS hub RPC (e.g. https://rpc-testnet.sparkl.network) — browsers and MetaMask can call it directly. */
export function isPublicHttpsChainRpc(rpcUrl: string): boolean {
  try {
    const u = new URL(rpcUrl);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Local Anvil / private HTTP only — dev impersonation and optional portal proxy. */
export function isLocalDevChainRpc(rpcUrl: string): boolean {
  try {
    const u = new URL(rpcUrl);
    if (u.protocol !== "http:") return false;
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
    const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Whether the portal should use same-origin `/api/rpc` for wagmi reads.
 * Off by default for public HTTPS chain RPC; on for local HTTP unless explicitly disabled.
 */
export function portalRpcProxyEnabled(cfg: HubChainConfig): boolean {
  const explicit = readSameOriginProxyEnv();
  if (isPublicHttpsChainRpc(cfg.rpcUrl)) {
    if (explicit === true) {
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV === "development" &&
        !warnedPublicRpcProxySkipped
      ) {
        warnedPublicRpcProxySkipped = true;
        console.warn(
          `[chains] NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY=1 ignored for public HTTPS chain RPC ${cfg.rpcUrl}. Portal and MetaMask use the chain URL directly.`,
        );
      }
    }
    return false;
  }
  if (explicit !== undefined) return explicit;
  return isLocalDevChainRpc(cfg.rpcUrl);
}

/**
 * Canonical hub node JSON-RPC (`NEXT_PUBLIC_RPC_URL_*`). MetaMask and other wallets must use this
 * URL to sign and broadcast — not the portal `/api/rpc` proxy.
 */
export function chainRpcUrl(cfg: HubChainConfig): string {
  return cfg.rpcUrl;
}

/**
 * JSON-RPC URL for the portal’s wagmi `publicClient` only (reads, simulate, receipts).
 * When **`NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY`** is on, the browser talks to same-origin
 * **`/api/rpc`** and Next forwards to **`RPC_PROXY_TARGET`**; chain submits never go through here.
 */
export function portalPublicRpcUrl(
  cfg: HubChainConfig,
  pageOrigin?: string,
): string {
  if (!portalRpcProxyEnabled(cfg)) {
    return cfg.rpcUrl;
  }
  const origin =
    pageOrigin ??
    (typeof window !== "undefined" ? window.location.origin : undefined);
  if (origin) {
    return `${origin}/api/rpc`;
  }
  const fixed = process.env.NEXT_PUBLIC_RPC_PUBLIC_PROXY_URL?.trim();
  if (fixed) {
    return fixed;
  }
  return cfg.rpcUrl;
}

/** @deprecated Use {@link portalPublicRpcUrl} or {@link chainRpcUrl} explicitly. */
export function walletFacingRpcUrl(
  cfg: HubChainConfig,
  pageOrigin?: string,
): string {
  return portalPublicRpcUrl(cfg, pageOrigin);
}

/**
 * viem `Chain` for wagmi / RainbowKit.
 * `nativeCurrency` comes from `HubChainConfig` (env‑driven); it must match **`SettlementEscrow.nativeDotDecimals`**
 * and the wallet’s custom network, or `depositDot` amounts will not line up in the approval UI.
 */
export function hubChainFromConfig(
  cfg: HubChainConfig,
  pageOrigin?: string,
): Chain {
  return defineChain({
    id: cfg.chainId,
    name: cfg.chainName,
    nativeCurrency: cfg.nativeCurrency,
    rpcUrls: {
      default: { http: [chainRpcUrl(cfg)] },
    },
  });
}
