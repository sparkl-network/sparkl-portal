import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resetTelemetryHubForTests,
  startRouterTelemetryService,
  stopRouterTelemetryService,
  subscribeRouterTelemetryHub,
} from "@/lib/router/telemetryHub";

describe("telemetryHub", () => {
  afterEach(() => {
    resetTelemetryHubForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("dedupes concurrent subscribe requests across listeners", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        wsUrl: "ws://127.0.0.1:8080/status/subscribe?token=abc",
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      readyState = MockWebSocket.CONNECTING;
      onopen: (() => void) | null = null;
      onmessage: ((msg: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      close() {
        this.readyState = 3;
      }
    }
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    startRouterTelemetryService();
    const unsubA = subscribeRouterTelemetryHub({
      onEvent: () => {},
      onConnectionChange: () => {},
    });
    const unsubB = subscribeRouterTelemetryHub({
      onEvent: () => {},
      onConnectionChange: () => {},
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    unsubA();
    unsubB();
    stopRouterTelemetryService();
  });

  it("retains subscribe credentials across service stop and restart", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        wsUrl: "ws://127.0.0.1:8080/status/subscribe?token=abc",
        exp: Math.floor(Date.now() / 1000) + 300,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      readyState = MockWebSocket.CONNECTING;
      onopen: (() => void) | null = null;
      onmessage: ((msg: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      close() {
        this.readyState = 3;
      }
    }
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    startRouterTelemetryService();
    subscribeRouterTelemetryHub({
      onEvent: () => {},
      onConnectionChange: () => {},
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    stopRouterTelemetryService();
    startRouterTelemetryService();
    subscribeRouterTelemetryHub({
      onEvent: () => {},
      onConnectionChange: () => {},
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
