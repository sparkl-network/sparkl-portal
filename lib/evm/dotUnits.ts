/** Matches `SettlementEscrow` native vs internal (1e18 per whole DOT) accounting. */

export const INTERNAL_DOT_DECIMALS = 18 as const;

/** Polkadot Hub native DOT (Planck). Must match on-chain `SettlementEscrow.nativeDotDecimals` for Hub. */
export const HUB_NATIVE_DOT_DECIMALS = 10 as const;

export function nativeToInternal(amountNative: bigint, nativeDecimals: number): bigint {
  if (
    !Number.isInteger(nativeDecimals) ||
    nativeDecimals <= 0 ||
    nativeDecimals > INTERNAL_DOT_DECIMALS
  ) {
    throw new Error(
      `nativeDecimals must be an integer in (0, ${INTERNAL_DOT_DECIMALS}], got ${nativeDecimals}`,
    );
  }
  const exp = INTERNAL_DOT_DECIMALS - nativeDecimals;
  const scale = BigInt(10 ** exp);
  return amountNative * scale;
}

export function internalToNative(amountInternal: bigint, nativeDecimals: number): bigint {
  if (
    !Number.isInteger(nativeDecimals) ||
    nativeDecimals <= 0 ||
    nativeDecimals > INTERNAL_DOT_DECIMALS
  ) {
    throw new Error(
      `nativeDecimals must be an integer in (0, ${INTERNAL_DOT_DECIMALS}], got ${nativeDecimals}`,
    );
  }
  const exp = INTERNAL_DOT_DECIMALS - nativeDecimals;
  const scale = BigInt(10 ** exp);
  return amountInternal / scale;
}
