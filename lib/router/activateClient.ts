import type { Hex, PublicClient, WalletClient } from "viem";
import type { Connector } from "wagmi";

import { getConnectedInjectedProvider } from "@/lib/evm/injectedProvider";
import {
  buildActivateMessage,
  type RouterActivateResponse,
} from "@/lib/router/activate";
import { isWalletTransportError } from "@/lib/evm/escrow";

export class RouterActivateError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RouterActivateError";
  }
}

function extractActivateError(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string" && err.length > 0) return err;
    if (typeof err === "object" && err !== null && "message" in err) {
      const msg = (err as { message: unknown }).message;
      if (typeof msg === "string" && msg.length > 0) return msg;
    }
  }
  if (typeof body === "string" && body.length > 0) return body;
  return `Activate failed (${status})`;
}

async function signActivateMessage(
  walletClient: WalletClient,
  message: string,
  connector?: Connector,
): Promise<Hex> {
  const account = walletClient.account;
  if (!account) throw new RouterActivateError("Wallet account unavailable");

  try {
    return await walletClient.signMessage({
      account: account as unknown as `0x${string}`,
      message,
    });
  } catch (err) {
    if (!isWalletTransportError(err)) throw err;
    const eth = await getConnectedInjectedProvider(connector);
    if (!eth?.request) throw err;
    const sig = await eth.request({
      method: "personal_sign",
      params: [message, account.address],
    });
    if (typeof sig !== "string" || !sig.startsWith("0x")) {
      throw new RouterActivateError(`Wallet returned unexpected signature: ${String(sig)}`);
    }
    return sig as Hex;
  }
}

/** Wallet-signed activate via portal proxy → sparkl-router. */
export async function activateSessionViaPortal(params: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  sessionId: bigint;
  connector?: Connector;
}): Promise<RouterActivateResponse> {
  const { walletClient, publicClient, sessionId, connector } = params;

  const blockNumber = await publicClient.getBlockNumber();
  const message = buildActivateMessage(sessionId, blockNumber);
  const signature = await signActivateMessage(walletClient, message, connector);

  const res = await fetch("/api/router-activate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sessionId: sessionId.toString(),
      signature,
      blockNumber: Number(blockNumber),
      message,
    }),
  });

  let body: unknown;
  const text = await res.text();
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text;
  }

  if (!res.ok) {
    throw new RouterActivateError(extractActivateError(body, res.status), res.status);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("apiKey" in body) ||
    typeof (body as { apiKey: unknown }).apiKey !== "string"
  ) {
    throw new RouterActivateError("Router response missing apiKey");
  }

  return body as RouterActivateResponse;
}
