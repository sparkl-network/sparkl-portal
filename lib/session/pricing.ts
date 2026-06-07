import { formatUnits } from "viem";

import type { EscrowSession } from "@/lib/types";
import { SecurityTier } from "@/lib/types";

export type SessionPricingRates = {
  inputPricePer1k: bigint;
  outputPricePer1k: bigint;
  usdcPerDot: bigint;
  usedDefault: boolean;
  /** True when rates were read live (legacy session without on-chain snapshot). */
  legacy: boolean;
};

const BPS_DENOM = 10_000n;
const INTERNAL_DOT_DECIMALS = 18;
const USDC_DECIMALS = 6;

/**
 * On-chain pricing snapshot from `openSession`, or `null` when all snapshot fields are zero
 * (sessions opened before pricing was recorded — use {@link loadSessionPricingFallback}).
 */
export function sessionPricing(session: EscrowSession): SessionPricingRates | null {
  if (
    session.inputPricePer1kAtOpen === 0n &&
    session.outputPricePer1kAtOpen === 0n &&
    session.usdcPerDotAtOpen === 0n
  ) {
    return null;
  }
  return {
    inputPricePer1k: session.inputPricePer1kAtOpen,
    outputPricePer1k: session.outputPricePer1kAtOpen,
    usdcPerDot: session.usdcPerDotAtOpen,
    usedDefault: session.pricingUsedDefault,
    legacy: false,
  };
}

/** Mirrors `SettlementEscrow._applyUsage` using snapshotted per-1k rates. */
export function tokenCostAtOpenRates(
  input: bigint,
  output: bigint,
  pricing: SessionPricingRates,
  tier: SecurityTier,
  teePriceMultiplierBps: bigint,
): bigint {
  let cost =
    (input * pricing.inputPricePer1k + output * pricing.outputPricePer1k) / 1000n;
  if (tier === SecurityTier.TEE_VERIFIED) {
    cost = (cost * teePriceMultiplierBps) / BPS_DENOM;
  }
  return cost;
}

/** USDC smallest-units (6-dec) for internal DOT at `usdcPerDot` (6-dec per 1e18 internal DOT). */
export function internalDotToUsdc(dotInternal: bigint, usdcPerDot: bigint): bigint {
  if (usdcPerDot === 0n) return 0n;
  return (dotInternal * usdcPerDot) / 10n ** 18n;
}

/** User-facing remainder in the lock after recorded usage (`max(0, locked − usage)`). */
export function remainingInLock(session: EscrowSession): bigint {
  const rem = session.lockedInternal - session.usageRecorded;
  return rem > 0n ? rem : 0n;
}

export type MoneyLineParts = {
  dot: string;
  usd: string;
  tokens?: string;
};

export function formatDotInternal(dotInternal: bigint, symbol = "DOT"): string {
  const n = formatUnits(dotInternal, INTERNAL_DOT_DECIMALS);
  return `${trimTrailingZeros(n)} ${symbol}`;
}

export function formatUsdFromInternal(dotInternal: bigint, usdcPerDot: bigint): string {
  const usdc = internalDotToUsdc(dotInternal, usdcPerDot);
  const n = formatUnits(usdc, USDC_DECIMALS);
  return `$${trimTrailingZeros(n)}`;
}

/** Compact DOT + USD strings for balance table cells. */
export function formatMoneyLine(
  dotInternal: bigint,
  usdcPerDot: bigint,
  options?: { dotSymbol?: string; tokens?: string },
): MoneyLineParts {
  return {
    dot: formatDotInternal(dotInternal, options?.dotSymbol ?? "DOT"),
    usd: formatUsdFromInternal(dotInternal, usdcPerDot),
    tokens: options?.tokens,
  };
}

function trimTrailingZeros(formatted: string): string {
  if (!formatted.includes(".")) return formatted;
  return formatted.replace(/\.?0+$/, "");
}
