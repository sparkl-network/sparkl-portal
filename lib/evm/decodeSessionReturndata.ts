import { getAddress, type Address, type Hex } from "viem";

import { SecurityTier, type EscrowSession } from "@/lib/types";

const WORD = 32;
const SESSION_STRUCT_OFFSET = 0x20;
/** Static words through `pricingUsedDefault` plus the `name` offset slot. */
const PRICING_STATIC_WORDS = 18;
/** Static words through `outputTokensRecorded` plus the `name` offset slot (legacy escrow). */
const LEGACY_STATIC_WORDS = 14;

function hexToBytes(hex: Hex): Uint8Array {
  const stripped = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function wordAt(data: Uint8Array, wordIndex: number): Uint8Array {
  const start = wordIndex * WORD;
  const end = start + WORD;
  if (data.length < end) {
    throw new Error(`sessions() returndata too short (need ${end} bytes, got ${data.length})`);
  }
  return data.subarray(start, end);
}

function u256At(data: Uint8Array, wordIndex: number): bigint {
  return BigInt(`0x${Buffer.from(wordAt(data, wordIndex)).toString("hex")}`);
}

function addressAt(data: Uint8Array, wordIndex: number): Address {
  const w = wordAt(data, wordIndex);
  return getAddress(`0x${Buffer.from(w.subarray(12, 32)).toString("hex")}`);
}

function bytes32At(data: Uint8Array, wordIndex: number): Hex {
  return `0x${Buffer.from(wordAt(data, wordIndex)).toString("hex")}` as Hex;
}

function u64At(data: Uint8Array, wordIndex: number): bigint {
  const w = wordAt(data, wordIndex);
  let hex = "";
  for (let i = 24; i < 32; i += 1) {
    hex += w[i].toString(16).padStart(2, "0");
  }
  return BigInt(`0x${hex}`);
}

function boolAt(data: Uint8Array, wordIndex: number): boolean {
  return wordAt(data, wordIndex)[31] !== 0;
}

function chainTier(value: number): SecurityTier {
  return value === 1 ? SecurityTier.TEE_VERIFIED : SecurityTier.BEST_EFFORT;
}

function sessionHeadSlice(data: Uint8Array): { head: Uint8Array; structStart: number } {
  if (data.length < WORD) {
    throw new Error(`sessions() returndata too short (got ${data.length} bytes)`);
  }
  const offset = u256At(data, 0);
  if (offset === BigInt(SESSION_STRUCT_OFFSET)) {
    return { head: data.subarray(SESSION_STRUCT_OFFSET), structStart: SESSION_STRUCT_OFFSET };
  }
  return { head: data, structStart: 0 };
}

function decodeAbiString(
  data: Uint8Array,
  head: Uint8Array,
  structStart: number,
  nameOffsetWordIndex: number,
): string {
  const nameRelOffset = Number(u256At(head, nameOffsetWordIndex));
  const nameStart = structStart + nameRelOffset;
  if (nameStart + WORD > data.length) return "";
  const length = Number(u256At(data, nameStart / WORD));
  const bytesStart = nameStart + WORD;
  const bytesEnd = bytesStart + length;
  if (bytesEnd > data.length) return "";
  return new TextDecoder().decode(data.subarray(bytesStart, bytesEnd));
}

function usesPricingLayout(data: Uint8Array, structStart: number): boolean {
  return data.length >= structStart + PRICING_STATIC_WORDS * WORD;
}

/**
 * Decode `SettlementEscrow.sessions(uint256)` returndata without viem struct/tuple parsing.
 * Handles ABI struct offset (`0x20`) and trailing dynamic `string name`.
 */
export function decodeSessionFromReturndata(raw: Hex): EscrowSession {
  const data = hexToBytes(raw);
  const { head, structStart } = sessionHeadSlice(data);
  const pricing = usesPricingLayout(data, structStart);

  if (pricing) {
    if (head.length < PRICING_STATIC_WORDS * WORD) {
      throw new Error("sessions() returndata too short for pricing session head");
    }
    return {
      user: addressAt(head, 0),
      nodeId: bytes32At(head, 1),
      modelId: bytes32At(head, 2),
      tier: chainTier(wordAt(head, 3)[31]),
      lockedInternal: u256At(head, 4),
      usageRecorded: u256At(head, 5),
      paidToProviderInternal: u256At(head, 6),
      paidToProtocolInternal: u256At(head, 7),
      openingInternal: u256At(head, 8),
      openedAt: u64At(head, 9),
      settled: boolAt(head, 10),
      inputTokensRecorded: u64At(head, 11),
      outputTokensRecorded: u64At(head, 12),
      inputPricePer1kAtOpen: u256At(head, 13),
      outputPricePer1kAtOpen: u256At(head, 14),
      usdcPerDotAtOpen: u256At(head, 15),
      pricingUsedDefault: boolAt(head, 16),
      name: decodeAbiString(data, head, structStart, 17),
    };
  }

  if (head.length < LEGACY_STATIC_WORDS * WORD) {
    throw new Error("sessions() returndata too short for legacy session head");
  }

  return {
    user: addressAt(head, 0),
    nodeId: bytes32At(head, 1),
    modelId: bytes32At(head, 2),
    tier: chainTier(wordAt(head, 3)[31]),
    lockedInternal: u256At(head, 4),
    usageRecorded: u256At(head, 5),
    paidToProviderInternal: u256At(head, 6),
    paidToProtocolInternal: u256At(head, 7),
    openingInternal: u256At(head, 8),
    openedAt: u64At(head, 9),
    settled: boolAt(head, 10),
    inputTokensRecorded: u64At(head, 11),
    outputTokensRecorded: u64At(head, 12),
    inputPricePer1kAtOpen: 0n,
    outputPricePer1kAtOpen: 0n,
    usdcPerDotAtOpen: 0n,
    pricingUsedDefault: false,
    name: decodeAbiString(data, head, structStart, 13),
  };
}
