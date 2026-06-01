import { NextResponse } from "next/server";
import {
  type Address,
  createTestClient,
  createWalletClient,
  http,
  isAddress,
} from "viem";
import { foundry } from "viem/chains";
import { impersonateAccount } from "viem/actions";

import { settlementEscrowAbi } from "@/lib/abi";
import { getActiveChainConfig, isLocalDevChainRpc } from "@/lib/chains";
import { internalToNative } from "@/lib/evm/dotUnits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  address?: string;
  amountInternal?: string;
};

function devOnly(): NextResponse | null {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (process.env.NEXT_PUBLIC_CHAIN_ENV !== "assethub-dev-stub") {
    return NextResponse.json(
      { error: "Anvil escrow bypass is only for assethub-dev-stub" },
      { status: 403 },
    );
  }
  const cfg = getActiveChainConfig();
  const target =
    process.env.RPC_PROXY_TARGET?.trim() || cfg.rpcUrl;
  if (!isLocalDevChainRpc(target)) {
    return NextResponse.json(
      {
        error:
          "Anvil impersonation only works against a local chain RPC (http://127.0.0.1:8545). Use MetaMask with the chain RPC for shared testnet.",
      },
      { status: 403 },
    );
  }
  if (!target) {
    return NextResponse.json(
      { error: "RPC_PROXY_TARGET or chain RPC URL is not set" },
      { status: 501 },
    );
  }
  return null;
}

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "deposit" && action !== "withdraw") {
    return NextResponse.json(
      { error: 'action must be "deposit" or "withdraw"' },
      { status: 400 },
    );
  }

  const address = body.address?.trim();
  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: "address must be a valid 0x-prefixed account" },
      { status: 400 },
    );
  }

  let amountInternal: bigint;
  try {
    if (body.amountInternal == null || body.amountInternal === "") {
      throw new Error("missing");
    }
    amountInternal = BigInt(body.amountInternal);
    if (amountInternal <= 0n) throw new Error("non-positive");
  } catch {
    return NextResponse.json(
      { error: "amountInternal must be a positive integer string (wei-scale DOT)" },
      { status: 400 },
    );
  }

  const cfg = getActiveChainConfig();
  const escrow = cfg.settlementEscrowAddress;
  const target =
    process.env.RPC_PROXY_TARGET?.trim() || cfg.rpcUrl;

  const testClient = createTestClient({
    mode: "anvil",
    chain: foundry,
    transport: http(target),
  });

  const walletClient = createWalletClient({
    chain: foundry,
    transport: http(target),
    account: address as Address,
  });

  try {
    await impersonateAccount(testClient, { address: address as Address });

    let hash: `0x${string}`;
    if (action === "deposit") {
      const value = internalToNative(
        amountInternal,
        cfg.nativeCurrency.decimals,
      );
      hash = await walletClient.writeContract({
        address: escrow,
        abi: settlementEscrowAbi,
        functionName: "depositDot",
        args: [],
        value,
      });
    } else {
      hash = await walletClient.writeContract({
        address: escrow,
        abi: settlementEscrowAbi,
        functionName: "withdrawDot",
        args: [amountInternal],
      });
    }

    return NextResponse.json({ hash });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
