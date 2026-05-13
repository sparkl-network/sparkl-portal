import type { Abi } from "viem";

import settlementEscrowJson from "./SettlementEscrow.json";
import providerRegistryJson from "./ProviderRegistry.json";

/**
 * Normalize Foundry/Hardhat artifacts (`{ abi, bytecode, ... }`) vs bare ABI arrays.
 * Viem requires a real array; passing the full artifact makes `abi.filter` throw.
 */
function asContractAbi(json: unknown): Abi {
  if (Array.isArray(json)) return json as Abi;
  if (json !== null && typeof json === "object" && "abi" in json) {
    const abi = (json as { abi: unknown }).abi;
    if (Array.isArray(abi)) return abi as Abi;
  }
  throw new Error("Invalid contract JSON: expected Abi[] or { abi: Abi[] }");
}

/**
 * Imported JSON keeps Solidity names (e.g. **`getProvider`**, **`registerNode`**).
 * In app copy and mental model: **`getProvider(nodeId)`** ≡ **read node info** for that **`nodeId`** (`NodeInfo`).
 */
export const providerRegistryAbi = asContractAbi(providerRegistryJson);
export const settlementEscrowAbi = asContractAbi(settlementEscrowJson);
