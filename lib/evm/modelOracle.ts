import {
  type Address,
  type Hex,
  type PublicClient,
  keccak256,
  parseAbiItem,
  toBytes,
} from "viem";

import { modelPriceOracleAbi } from "@/lib/abi";
import type { ModelPrice, NetworkModel } from "@/lib/types";

/** MVP network reference: USD per 1 million tokens (policy; matches oracle env defaults). */
export const MVP_DEFAULT_INPUT_PER_1M_USD = 0.1;
export const MVP_DEFAULT_OUTPUT_PER_1M_USD = 0.5;

/** Known model names for static catalog fallback when `PriceUpdated` logs are unavailable. */
export const KNOWN_MODEL_NAMES = [
  "gpt-4o",
  "gpt-4o-mini",
  "llama3:8b",
  "llama3:70b",
] as const;

const priceUpdatedEvent = parseAbiItem(
  "event PriceUpdated(bytes32 indexed modelId, string name, uint256 inputPer1k, uint256 outputPer1k)",
);

/** `keccak256(abi.encodePacked(modelName))` — matches Solidity and sparkl-solo `openSession`. */
export function modelNameToId(modelName: string): Hex {
  return keccak256(toBytes(modelName));
}

function normalizeModelPrice(row: unknown): ModelPrice {
  if (Array.isArray(row)) {
    const [inputPer1kTokens, outputPer1kTokens, updatedAt, active] = row as [
      bigint,
      bigint,
      bigint,
      boolean,
    ];
    return { inputPer1kTokens, outputPer1kTokens, updatedAt, active };
  }
  const s = row as {
    inputPer1kTokens: bigint;
    outputPer1kTokens: bigint;
    updatedAt: bigint;
    active: boolean;
  };
  return {
    inputPer1kTokens: s.inputPer1kTokens,
    outputPer1kTokens: s.outputPer1kTokens,
    updatedAt: s.updatedAt,
    active: s.active,
  };
}

/** `defaultPrice()` returns three fields (no `active` flag). */
function normalizeDefaultPrice(row: unknown): ModelPrice {
  if (Array.isArray(row)) {
    const [inputPer1kTokens, outputPer1kTokens, updatedAt] = row as [
      bigint,
      bigint,
      bigint,
    ];
    return {
      inputPer1kTokens,
      outputPer1kTokens,
      updatedAt,
      active: true,
    };
  }
  const s = row as {
    inputPer1kTokens: bigint;
    outputPer1kTokens: bigint;
    updatedAt: bigint;
  };
  return {
    inputPer1kTokens: s.inputPer1kTokens,
    outputPer1kTokens: s.outputPer1kTokens,
    updatedAt: s.updatedAt,
    active: true,
  };
}

export async function readModelPrice(
  publicClient: PublicClient,
  oracleAddress: Address,
  modelId: Hex,
): Promise<ModelPrice> {
  const raw = await publicClient.readContract({
    address: oracleAddress,
    abi: modelPriceOracleAbi,
    functionName: "prices",
    args: [modelId],
  });
  return normalizeModelPrice(raw);
}

/** Network-wide fallback from `ModelPriceOracle.defaultPrice`. */
export async function readDefaultModelPrice(
  publicClient: PublicClient,
  oracleAddress: Address,
): Promise<ModelPrice> {
  const raw = await publicClient.readContract({
    address: oracleAddress,
    abi: modelPriceOracleAbi,
    functionName: "defaultPrice",
  });
  return normalizeDefaultPrice(raw);
}

/** Effective billing rate (`getEffectivePrice`), including default fallback when delisted. */
export async function readEffectiveModelPrice(
  publicClient: PublicClient,
  oracleAddress: Address,
  modelId: Hex,
): Promise<{
  inputPer1kTokens: bigint;
  outputPer1kTokens: bigint;
  usedDefault: boolean;
}> {
  const [inputPer1k, outputPer1k, usedDefault] = (await publicClient.readContract({
    address: oracleAddress,
    abi: modelPriceOracleAbi,
    functionName: "getEffectivePrice",
    args: [modelId],
  })) as readonly [bigint, bigint, boolean];
  return {
    inputPer1kTokens: inputPer1k,
    outputPer1kTokens: outputPer1k,
    usedDefault,
  };
}

/** Active on-chain price for a model name, or null if unset/delisted (no default). */
export async function getModelPrice(
  publicClient: PublicClient,
  oracleAddress: Address,
  modelName: string,
): Promise<ModelPrice | null> {
  const modelId = modelNameToId(modelName);
  const price = await readModelPrice(publicClient, oracleAddress, modelId);
  if (price.updatedAt === 0n || !price.active) return null;
  return price;
}

/** Resolve model names from `PriceUpdated` logs (latest event per `modelId` wins). */
async function loadModelNamesById(
  publicClient: PublicClient,
  oracleAddress: Address,
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();

  for (const name of KNOWN_MODEL_NAMES) {
    nameById.set(modelNameToId(name).toLowerCase(), name);
  }

  try {
    const logs = await publicClient.getLogs({
      address: oracleAddress,
      event: priceUpdatedEvent,
      fromBlock: 0n,
      toBlock: "latest",
    });
    for (const log of logs) {
      const modelId = log.args.modelId;
      const name = log.args.name;
      if (modelId && name) {
        nameById.set(modelId.toLowerCase(), name);
      }
    }
  } catch {
    // RPC may disallow wide log scans; static catalog still applies.
  }

  return nameById;
}

function displayNameForModelId(
  modelId: Hex,
  nameById: Map<string, string>,
): string {
  return nameById.get(modelId.toLowerCase()) ?? modelId;
}

/** All active models listed on `ModelPriceOracle` (`modelIds` + `prices.active`). */
export async function listNetworkModels(
  publicClient: PublicClient,
  oracleAddress: Address,
): Promise<NetworkModel[]> {
  const length = (await publicClient.readContract({
    address: oracleAddress,
    abi: modelPriceOracleAbi,
    functionName: "modelIdsLength",
  })) as bigint;

  const nameById = await loadModelNamesById(publicClient, oracleAddress);

  const out: NetworkModel[] = [];
  for (let i = 0n; i < length; i += 1n) {
    const modelId = (await publicClient.readContract({
      address: oracleAddress,
      abi: modelPriceOracleAbi,
      functionName: "modelIds",
      args: [i],
    })) as Hex;

    const price = await readModelPrice(publicClient, oracleAddress, modelId);
    if (!price.active || price.updatedAt === 0n) continue;

    out.push({
      modelId,
      name: displayNameForModelId(modelId, nameById),
      price,
    });
  }

  return out;
}

/** @deprecated Use {@link listNetworkModels}. */
export const getNetworkModelPrices = listNetworkModels;
