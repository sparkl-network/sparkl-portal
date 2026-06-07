import {
  type Address,
  type PublicClient,
  parseAbi,
} from "viem";

import { settlementEscrowAbi } from "@/lib/abi";

/** Selector for `RateSetter.RateTooStale()`. */
export const RATE_TOO_STALE_SELECTOR = "0xadd6f2af";

const rateSetterViewAbi = parseAbi([
  "function getUsdcPerDot() view returns (uint256)",
  "function priceUpdatedAt() view returns (uint256)",
  "function maxStaleness() view returns (uint256)",
  "error RateTooStale()",
]);

export type RateOracleStatus = {
  oracleAddress: Address;
  updatedAt: bigint;
  maxStalenessSecs: bigint;
  ageSecs: bigint | null;
  fresh: boolean;
  usdcPerDot: bigint | null;
};

export function isRateTooStaleError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("RateTooStale") ||
    msg.includes(RATE_TOO_STALE_SELECTOR)
  );
}

export function formatRateTooStaleHelp(chainEnv: string): string {
  const base =
    "SettlementEscrow snapshots the DOT/USDC rate at openSession. The on-chain RateSetter rate is missing or older than maxStaleness.";
  if (chainEnv === "assethub-dev-stub") {
    return `${base}\n\nLocal dev: start sparkl-oracle-rates (yarn start in sparkl-oracle-rates; set RATE_SETTER_ADDRESS from contracts/deployments/local.json and ORACLE_PRIVATE_KEY to the RateSetter updater wallet). Or push once:\n\ncast send <RateSetter> \"setRate(uint256,uint256)\" 1340000 746268656716417910 --rpc-url http://127.0.0.1:8545 --private-key <updater-key>\n\n(Use dotPerUsdc = 1e24 / usdcPerDot; default usdcPerDot is 1_340_000.) Redeploy with ORACLE_MAX_STALENESS=0 to disable staleness on a throwaway chain.`;
  }
  return `${base}\n\nEnsure sparkl-oracle-rates is running and its updater wallet matches RateSetter.updater on this chain.`;
}

async function readRateOracleAddress(
  publicClient: PublicClient,
  escrowAddress: Address,
): Promise<Address> {
  return publicClient.readContract({
    address: escrowAddress,
    abi: settlementEscrowAbi,
    functionName: "priceOracle",
  }) as Promise<Address>;
}

export async function readRateOracleStatus(
  publicClient: PublicClient,
  escrowAddress: Address,
): Promise<RateOracleStatus> {
  const oracleAddress = await readRateOracleAddress(publicClient, escrowAddress);
  const [updatedAt, maxStalenessSecs] = await Promise.all([
    publicClient.readContract({
      address: oracleAddress,
      abi: rateSetterViewAbi,
      functionName: "priceUpdatedAt",
    }) as Promise<bigint>,
    publicClient.readContract({
      address: oracleAddress,
      abi: rateSetterViewAbi,
      functionName: "maxStaleness",
    }) as Promise<bigint>,
  ]);

  const block = await publicClient.getBlock();
  const now = block.timestamp;
  const ageSecs = updatedAt > 0n ? now - updatedAt : null;
  const fresh =
    maxStalenessSecs === 0n ||
    (updatedAt > 0n && ageSecs !== null && ageSecs <= maxStalenessSecs);

  let usdcPerDot: bigint | null = null;
  if (fresh) {
    try {
      usdcPerDot = (await publicClient.readContract({
        address: oracleAddress,
        abi: rateSetterViewAbi,
        functionName: "getUsdcPerDot",
      })) as bigint;
    } catch {
      usdcPerDot = null;
    }
  }

  return {
    oracleAddress,
    updatedAt,
    maxStalenessSecs,
    ageSecs,
    fresh,
    usdcPerDot,
  };
}
