"use client";

import { TelemetryDashboard } from "@/components/telemetry/TelemetryDashboard";
import { routerBaseUrl } from "@/lib/router/activate";
import {
  useRouterCatalogProviders,
  useRouterNodesStatus,
} from "@/lib/router/useRouterData";
import { useRouterTelemetry } from "@/lib/router/useRouterTelemetry";

export default function TelemetryPage() {
  const routerConfigured = Boolean(routerBaseUrl());

  const {
    data: nodesResponse,
    isLoading: nodesLoading,
    unavailable: routerUnavailable,
  } = useRouterNodesStatus();
  const { data: catalogResponse, isLoading: catalogLoading } =
    useRouterCatalogProviders();

  const initialNodes = nodesResponse?.nodes;
  const initialProviders = catalogResponse?.data;

  const { connected, providers, nodes, error } = useRouterTelemetry({
    enabled: routerConfigured,
    initialProviders,
    initialNodes,
  });

  const loading =
    routerConfigured &&
    (nodesLoading || catalogLoading) &&
    !nodes?.length &&
    !providers?.length;

  return (
    <div className="px-3 py-3 w-full max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Router telemetry</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live node status and per-model capacity from sparkl-router
        </p>
      </div>

      <TelemetryDashboard
        routerConfigured={routerConfigured}
        loading={loading}
        routerUnavailable={routerUnavailable}
        connected={connected}
        telemetryError={error}
        nodes={nodes}
        providers={providers}
        routerUptimeSecs={nodesResponse?.router_uptime_secs}
      />
    </div>
  );
}
