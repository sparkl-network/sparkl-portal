import { describe, expect, it } from "vitest";

import {
  getActiveChainConfig,
  isLocalDevChainRpc,
  isPublicHttpsChainRpc,
  portalRpcProxyEnabled,
} from "./chains";

describe("portalRpcProxyEnabled", () => {
  it("disables proxy for public HTTPS chain RPC", () => {
    const cfg = {
      ...getActiveChainConfig(),
      rpcUrl: "https://rpc-testnet.sparkl.network",
    };
    expect(isPublicHttpsChainRpc(cfg.rpcUrl)).toBe(true);
    expect(portalRpcProxyEnabled(cfg)).toBe(false);
  });

  it("enables proxy for local HTTP when proxy env is unset", () => {
    const prev = process.env.NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY;
    delete process.env.NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY;
    try {
      const cfg = {
        ...getActiveChainConfig(),
        rpcUrl: "http://127.0.0.1:8545",
      };
      expect(isLocalDevChainRpc(cfg.rpcUrl)).toBe(true);
      expect(portalRpcProxyEnabled(cfg)).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY;
      } else {
        process.env.NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY = prev;
      }
    }
  });
});
