/** Matches `SettlementEscrow` native (Planck-style) vs internal accounting. */

export const INTERNAL_DOT_DECIMALS = 18 as const;
export const NATIVE_DOT_DECIMALS = 10 as const;

const SCALE = BigInt(10 ** (INTERNAL_DOT_DECIMALS - NATIVE_DOT_DECIMALS));

export function nativeToInternal(amountNative: bigint): bigint {
  return amountNative * SCALE;
}

export function internalToNative(amountInternal: bigint): bigint {
  return amountInternal / SCALE;
}
