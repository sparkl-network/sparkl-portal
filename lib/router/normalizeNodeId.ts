import { type Hex, isHex } from "viem";

/** Canonical map key: lowercase `0x` + 64 hex chars (registry bytes32). */
export function normalizeNodeId(input: string | Hex | null | undefined): string | null {
  if (input == null) return null;
  const raw = typeof input === "string" ? input.trim() : input;
  if (!raw) return null;

  let hex = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;

  if (hex.length > 64) return null;
  if (hex.length < 64) {
    hex = hex.padStart(64, "0");
  }

  if (isHex(`0x${hex}` as Hex, { strict: false }) && hex.length === 64) {
    return `0x${hex.toLowerCase()}`;
  }
  return `0x${hex.toLowerCase()}`;
}
