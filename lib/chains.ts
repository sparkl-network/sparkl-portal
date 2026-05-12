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
 * For `assethub-dev-stub`, RPC/chain id and missing or malformed contract addresses fall back to local defaults (`0x0000…0000` placeholders until deploy).
 * Native currency metadata defaults to stub **ETH / 18 decimals** and Hub **DOT / 10**; override with **`NEXT_PUBLIC_NATIVE_*`** (see `.env.example`).
 * Other profiles require RPC, chain id, and valid contract addresses.
 */
export function getActiveChainConfig(): HubChainConfig {
  const chainEnv = getActiveChainEnv();

  let rpcUrl: string | undefined;
  let chainIdRaw: string | undefined;
  let chainName: string;
  let providerRegistryRaw: string | undefined;
  let settlementEscrowRaw: string | undefined;

  if (chainEnv === "assethub-dev-stub") {
    chainName = STUB_DEFAULTS.chainName;
    rpcUrl =
      trimEnv(process.env.NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB) ??
      STUB_DEFAULTS.rpcUrl;
    chainIdRaw =
      trimEnv(process.env.NEXT_PUBLIC_CHAIN_ID_ASSHUB_DEV_STUB) ??
      String(STUB_DEFAULTS.chainId);
    providerRegistryRaw = trimEnv(
      process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_ASSHUB_DEV_STUB,
    );
    settlementEscrowRaw = trimEnv(
      process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_ASSHUB_DEV_STUB,
    );
  } else if (chainEnv === "paseo") {
    chainName = "Paseo Hub EVM";
    rpcUrl = trimEnv(process.env.NEXT_PUBLIC_RPC_URL_PASEO);
    chainIdRaw = trimEnv(process.env.NEXT_PUBLIC_CHAIN_ID_PASEO);
    providerRegistryRaw = trimEnv(
      process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_PASEO,
    );
    settlementEscrowRaw = trimEnv(
      process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_PASEO,
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
    providerRegistryRaw = trimEnv(
      process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_POLKADOT,
    );
    settlementEscrowRaw = trimEnv(
      process.env.NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_POLKADOT,
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

  let providerRegistryAddress: `0x${string}`;
  let settlementEscrowAddress: `0x${string}`;

  if (chainEnv === "assethub-dev-stub") {
    if (!isValidEthAddress(providerRegistryRaw)) {
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV === "development" &&
        !warnedStubRegistryFallback
      ) {
        warnedStubRegistryFallback = true;
        console.warn(
          `[chains] NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_ASSHUB_DEV_STUB missing or invalid; using ${ZERO_ADDRESS} for local stub.`,
        );
      }
      providerRegistryAddress = ZERO_ADDRESS;
    } else {
      providerRegistryAddress = providerRegistryRaw;
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
  } else {
    if (!isValidEthAddress(providerRegistryRaw)) {
      throw new Error(
        chainEnv === "paseo"
          ? "NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_PASEO must be a valid 0x-prefixed 20-byte hex address"
          : "NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_POLKADOT must be a valid 0x-prefixed 20-byte hex address",
      );
    }
    if (!isValidEthAddress(settlementEscrowRaw)) {
      throw new Error(
        chainEnv === "paseo"
          ? "NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_PASEO must be a valid 0x-prefixed 20-byte hex address"
          : "NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_POLKADOT must be a valid 0x-prefixed 20-byte hex address",
      );
    }
    providerRegistryAddress = providerRegistryRaw;
    settlementEscrowAddress = settlementEscrowRaw;
  }

  const nativeCurrency = hubNativeCurrencyForEnv(chainEnv);

  return {
    chainEnv,
    chainId,
    chainName,
    rpcUrl,
    nativeCurrency,
    providerRegistryAddress,
    settlementEscrowAddress,
  };
}

function useSameOriginRpcProxyEnv(): boolean {
  const v = process.env.NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY;
  return v === "1" || v === "true";
}

/**
 * RPC URL on the viem `Chain` for **`wallet_addEthereumChain`** / MetaMask.
 * With **`NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY`**, this is **`…/api/rpc`** so the extension
 * can reach JSON-RPC like the page; otherwise MetaMask may **`Failed to fetch`** on **`eth_sendTransaction`**
 * while viem still works via the proxy transport.
 *
 * **Broadcast vs reads:** the app’s wagmi `publicClient` always uses this URL (when the proxy is on), so
 * **`eth_call`** / **`eth_blockNumber`** show up in the Next **`/api/rpc`** logs. MetaMask **submits**
 * **`eth_sendRawTransaction`** to the RPC URL **saved for that chain id** inside the extension. If you
 * had already added **31337** (or your chain) with **`http://127.0.0.1:8545`**, **`wallet_switchEthereumChain`**
 * will **not** replace that RPC — confirms will hit **8545** and you will **not** see a send in the Next
 * terminal. **Fix:** MetaMask → Settings → Networks → edit the network → set RPC to **`http(s)://<same host
 * you use for the portal>/api/rpc`**, or remove the network and let the app re-add it via **Switch network**.
 */
export function walletFacingRpcUrl(cfg: HubChainConfig): string {
  if (!useSameOriginRpcProxyEnv()) {
    return cfg.rpcUrl;
  }
  const fixed = process.env.NEXT_PUBLIC_RPC_PUBLIC_PROXY_URL?.trim();
  if (fixed) {
    return fixed;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/rpc`;
  }
  return cfg.rpcUrl;
}

/**
 * viem `Chain` for wagmi / RainbowKit.
 * `nativeCurrency` comes from `HubChainConfig` (env‑driven); it must match **`SettlementEscrow.nativeDotDecimals`**
 * and the wallet’s custom network, or `depositDot` amounts will not line up in the approval UI.
 */
export function hubChainFromConfig(cfg: HubChainConfig): Chain {
  return defineChain({
    id: cfg.chainId,
    name: cfg.chainName,
    nativeCurrency: cfg.nativeCurrency,
    rpcUrls: {
      default: { http: [walletFacingRpcUrl(cfg)] },
    },
  });
}
