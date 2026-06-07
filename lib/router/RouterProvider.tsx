"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  routerBaseUrl,
  routerConfigured,
  routerHttp,
  routerWs,
  type RouterTelemetryListener,
} from "@/lib/router/routerClient";
import {
  applyModelCapacityEvent,
  applyNodeStatusEvent,
  type TelemetryEvent,
} from "@/lib/router/telemetry";
import type { NodeStatus, ProviderOffering } from "@/lib/router/types";

export type RouterTelemetryState = {
  connected: boolean;
  error: string | null;
  providers: ProviderOffering[] | null;
  nodes: NodeStatus[] | null;
};

export type RouterContextValue = {
  configured: boolean;
  baseUrl: string | null;
  http: typeof routerHttp;
  telemetry: RouterTelemetryState;
  /** Subscribe to raw telemetry frames (e.g. custom reducers). */
  subscribeTelemetry: (listener: RouterTelemetryListener) => () => void;
};

const initialTelemetry: RouterTelemetryState = {
  connected: false,
  error: null,
  providers: null,
  nodes: null,
};

const RouterContext = createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const configured = routerConfigured();
  const baseUrl = routerBaseUrl();
  const [telemetry, setTelemetry] = useState<RouterTelemetryState>(initialTelemetry);

  const applyEvent = useCallback((event: TelemetryEvent) => {
    setTelemetry((prev) => {
      if (event.type === "snapshot") {
        const providers = event.models.map((m) => ({
          node_id: m.node_id,
          model_id: m.model_id,
          tunnel_status: "unknown" as const,
          context_length: 0,
          quantization: "",
          parameter_count: "",
          source_url: "",
          features: {},
          concurrency: m.concurrency,
          active_requests: m.active_requests,
          queued_requests: m.queued_requests,
          active_sessions: m.active_requests,
          available_slots:
            m.concurrency > 0
              ? Math.max(0, m.concurrency - m.active_requests)
              : 0,
        }));
        const nodes = event.nodes.map((n) => ({
          node_id: n.node_id,
          moniker: n.moniker ?? null,
          status: n.status as NodeStatus["status"],
          connected_at: null,
          last_pong_at: null,
          uptime_secs: null,
          in_flight_requests: n.in_flight_requests,
          model_count: n.model_count,
        }));
        return { ...prev, providers, nodes };
      }
      if (event.type === "model_capacity") {
        const base = prev.providers ?? [];
        return {
          ...prev,
          providers: applyModelCapacityEvent(base, event),
        };
      }
      if (event.type === "node_status") {
        const base = prev.nodes ?? [];
        return {
          ...prev,
          nodes: applyNodeStatusEvent(base, event),
        };
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    if (!configured) return;

    routerWs.startTelemetry();
    const unsubscribe = routerWs.subscribeTelemetry({
      onEvent: applyEvent,
      onConnectionChange: (connected, error) => {
        setTelemetry((s) => ({ ...s, connected, error }));
      },
    });

    return () => {
      unsubscribe();
      routerWs.stopTelemetry();
    };
  }, [configured, applyEvent]);

  const subscribeTelemetry = useCallback(
    (listener: RouterTelemetryListener) => routerWs.subscribeTelemetry(listener),
    [],
  );

  const value = useMemo<RouterContextValue>(
    () => ({
      configured,
      baseUrl,
      http: routerHttp,
      telemetry,
      subscribeTelemetry,
    }),
    [configured, baseUrl, telemetry, subscribeTelemetry],
  );

  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useRouter must be used within RouterProvider");
  }
  return ctx;
}
