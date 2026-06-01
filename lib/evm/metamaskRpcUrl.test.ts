import { describe, expect, it } from "vitest";

import { walletAddEthereumChainRpcUrl } from "./metamaskRpcUrl";

describe("walletAddEthereumChainRpcUrl", () => {
  it("does not rewrite HTTP LAN chain RPC", () => {
    const r = walletAddEthereumChainRpcUrl("http://192.168.10.199:8545");
    expect(r.addUrl).toBe("http://192.168.10.199:8545");
    expect(r.usedLoopbackForAdd).toBe(false);
  });

  it("keeps localhost HTTP unchanged", () => {
    const r = walletAddEthereumChainRpcUrl("http://localhost:3000/api/rpc");
    expect(r.addUrl).toBe("http://localhost:3000/api/rpc");
    expect(r.usedLoopbackForAdd).toBe(false);
  });
});
