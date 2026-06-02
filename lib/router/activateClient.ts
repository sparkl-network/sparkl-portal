import type { Address, PublicClient, WalletClient } from "viem";

import {
  buildActivateMessage,
  type RouterActivateResponse,
} from "@/lib/router/activate";

export class RouterActivateError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RouterActivateError";
  }
}

/** Wallet-signed activate via portal proxy → sparkl-router. */
export async function activateSessionViaPortal(params: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  sessionId: bigint;
}): Promise<RouterActivateResponse> {
  const { walletClient, publicClient, sessionId } = params;
  const account = walletClient.account;
  if (!account) throw new RouterActivateError("Wallet account unavailable");

  const blockNumber = await publicClient.getBlockNumber();
  const message = buildActivateMessage(sessionId, blockNumber);
  const signature = await walletClient.signMessage({
    account: account as unknown as `0x${string}`,
    message,
  });

  const res = await fetch("/api/router-activate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sessionId: sessionId.toString(),
      signature,
      blockNumber: blockNumber.toString(),
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
    const errMsg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Activate failed (${res.status})`;
    throw new RouterActivateError(errMsg, res.status);
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
