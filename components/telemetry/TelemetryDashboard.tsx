"use client";

import NextLink from "next/link";
import { LayoutGrid, List, Radio, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { RouterTunnelBadge } from "@/components/router/RouterTunnelBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCapacityRatio } from "@/lib/router/telemetry";
import {
  buildModelTelemetryFacets,
  DEFAULT_MODEL_TELEMETRY_FILTERS,
  DEFAULT_NODE_TELEMETRY_FILTERS,
  filterModelTelemetry,
  filterNodeTelemetry,
  modelFiltersAreActive,
  nodeFiltersAreActive,
  type ModelTelemetryFilterState,
  type NodeTelemetryFilterState,
} from "@/lib/router/telemetryFilters";
import type { NodeStatus, ProviderOffering } from "@/lib/router/types";
import { cn } from "@/lib/utils";

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-start gap-0 min-w-[100px]">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="text-xl tabular-nums font-mono">{value}</span>
      {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: "table" | "list";
  onChange: (mode: "table" | "list") => void;
}) {
  return (
    <div className="flex rounded-md border bg-background p-0.5">
      <Button
        type="button"
        size="sm"
        variant={viewMode === "table" ? "secondary" : "ghost"}
        className="h-8 px-2.5"
        aria-pressed={viewMode === "table"}
        onClick={() => onChange("table")}
        title="Table view"
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={viewMode === "list" ? "secondary" : "ghost"}
        className="h-8 px-2.5"
        aria-pressed={viewMode === "list"}
        onClick={() => onChange("list")}
        title="List view"
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ConnectionBadge({
  connected,
  loading,
  error,
}: {
  connected: boolean;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <Badge variant="outline" className="gap-1.5">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Loading
      </Badge>
    );
  }
  if (error) {
    return (
      <Badge variant="destructive" className="gap-1.5" title={error}>
        <Radio className="h-3 w-3" />
        Disconnected
      </Badge>
    );
  }
  return (
    <Badge variant={connected ? "default" : "secondary"} className="gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: connected ? "#16a34a" : "#9ca3af" }}
      />
      {connected ? "Live" : "Polling"}
    </Badge>
  );
}

function NodeTelemetryToolbar({
  filters,
  patchFilters,
  resetFilters,
  totalCount,
  filteredCount,
}: {
  filters: NodeTelemetryFilterState;
  patchFilters: (patch: Partial<NodeTelemetryFilterState>) => void;
  resetFilters: () => void;
  totalCount: number;
  filteredCount: number;
}) {
  const active = nodeFiltersAreActive(filters);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-1 space-y-1 min-w-0">
          <Label htmlFor="node-telemetry-search" className="text-xs text-muted-foreground">
            Search nodes
          </Label>
          <Input
            id="node-telemetry-search"
            placeholder="Node id or moniker…"
            value={filters.query}
            onChange={(e) => patchFilters({ query: e.target.value })}
          />
        </div>
        <ViewModeToggle
          viewMode={filters.viewMode}
          onChange={(viewMode) => patchFilters({ viewMode })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tunnel status</Label>
          <Select
            value={filters.tunnelStatus || "__any__"}
            onValueChange={(v) =>
              patchFilters({ tunnelStatus: v === "__any__" ? "" : (v as NodeTelemetryFilterState["tunnelStatus"]) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="degraded">Degraded</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">In-flight requests</Label>
          <Select
            value={filters.inFlight || "__any__"}
            onValueChange={(v) =>
              patchFilters({ inFlight: v === "__any__" ? "" : (v as NodeTelemetryFilterState["inFlight"]) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any</SelectItem>
              <SelectItem value="yes">Has in-flight</SelectItem>
              <SelectItem value="no">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Models cached</Label>
          <Select
            value={filters.hasModels || "__any__"}
            onValueChange={(v) =>
              patchFilters({ hasModels: v === "__any__" ? "" : (v as NodeTelemetryFilterState["hasModels"]) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any</SelectItem>
              <SelectItem value="yes">Has models</SelectItem>
              <SelectItem value="no">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {filteredCount} of {totalCount} node(s)
        </span>
        {active ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={resetFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ModelTelemetryToolbar({
  filters,
  patchFilters,
  resetFilters,
  facets,
  totalCount,
  filteredCount,
}: {
  filters: ModelTelemetryFilterState;
  patchFilters: (patch: Partial<ModelTelemetryFilterState>) => void;
  resetFilters: () => void;
  facets: ReturnType<typeof buildModelTelemetryFacets>;
  totalCount: number;
  filteredCount: number;
}) {
  const active = modelFiltersAreActive(filters);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-1 space-y-1 min-w-0">
          <Label htmlFor="model-telemetry-search" className="text-xs text-muted-foreground">
            Search models
          </Label>
          <Input
            id="model-telemetry-search"
            placeholder="Model id, node id, quantization…"
            value={filters.query}
            onChange={(e) => patchFilters({ query: e.target.value })}
          />
        </div>
        <ViewModeToggle
          viewMode={filters.viewMode}
          onChange={(viewMode) => patchFilters({ viewMode })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tunnel status</Label>
          <Select
            value={filters.tunnelStatus || "__any__"}
            onValueChange={(v) => patchFilters({ tunnelStatus: v === "__any__" ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any</SelectItem>
              {facets.tunnelStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Load state</Label>
          <Select
            value={filters.loadState || "__any__"}
            onValueChange={(v) =>
              patchFilters({
                loadState: v === "__any__" ? "" : (v as ModelTelemetryFilterState["loadState"]),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any</SelectItem>
              <SelectItem value="at_capacity">At capacity</SelectItem>
              <SelectItem value="has_queue">Has queue</SelectItem>
              <SelectItem value="has_slots">Has slots</SelectItem>
              <SelectItem value="idle">Idle</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Quantization</Label>
          <Select
            value={filters.quantization || "__any__"}
            onValueChange={(v) => patchFilters({ quantization: v === "__any__" ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any</SelectItem>
              {facets.quantizations.map((q) => (
                <SelectItem key={q} value={q}>
                  {q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="min-queued" className="text-xs text-muted-foreground">
            Min queued
          </Label>
          <Input
            id="min-queued"
            type="number"
            min={0}
            placeholder="Any"
            value={filters.minQueued}
            onChange={(e) => patchFilters({ minQueued: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {filteredCount} of {totalCount} offering(s)
        </span>
        {active ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={resetFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function NodesTable({ nodes }: { nodes: NodeStatus[] }) {
  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Node</TableHead>
            <TableHead>Moniker</TableHead>
            <TableHead>Tunnel</TableHead>
            <TableHead className="text-right">In flight</TableHead>
            <TableHead className="text-right">Models</TableHead>
            <TableHead className="text-right">Uptime</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodes.map((node) => (
            <TableRow key={node.node_id}>
              <TableCell className="font-mono text-xs">
                <NextLink
                  href={`/node/${node.node_id}`}
                  className="text-primary hover:underline break-all"
                >
                  {node.node_id}
                </NextLink>
              </TableCell>
              <TableCell className="text-sm">{node.moniker ?? "—"}</TableCell>
              <TableCell>
                <RouterTunnelBadge status={node.status} detail={node} compact />
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-sm">
                {node.in_flight_requests}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-sm">
                {node.model_count}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-xs text-muted-foreground">
                {node.uptime_secs != null ? `${node.uptime_secs}s` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function NodesList({ nodes }: { nodes: NodeStatus[] }) {
  return (
    <div className="space-y-2">
      {nodes.map((node) => (
        <div
          key={node.node_id}
          className="rounded-lg border bg-card p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
        >
          <div className="min-w-0 space-y-1">
            <NextLink
              href={`/node/${node.node_id}`}
              className="font-mono text-xs text-primary hover:underline break-all"
            >
              {node.node_id}
            </NextLink>
            {node.moniker ? (
              <p className="text-sm text-muted-foreground">{node.moniker}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <RouterTunnelBadge status={node.status} detail={node} compact />
            <span className="font-mono tabular-nums">
              {node.in_flight_requests} in flight
            </span>
            <span className="font-mono tabular-nums">{node.model_count} models</span>
            {node.uptime_secs != null ? (
              <span className="text-xs text-muted-foreground font-mono">
                {node.uptime_secs}s uptime
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ModelsTable({ providers }: { providers: ProviderOffering[] }) {
  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Node</TableHead>
            <TableHead>Tunnel</TableHead>
            <TableHead className="text-right">Active</TableHead>
            <TableHead className="text-right">Queued</TableHead>
            <TableHead className="text-right">Slots</TableHead>
            <TableHead>Quantization</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((p) => (
            <TableRow key={`${p.node_id}-${p.model_id}`}>
              <TableCell className="font-mono text-xs max-w-[220px]">
                <NextLink
                  href={`/model?modelId=${encodeURIComponent(p.model_id)}`}
                  className="text-primary hover:underline break-all"
                >
                  {p.model_id}
                </NextLink>
              </TableCell>
              <TableCell className="font-mono text-xs">
                <NextLink
                  href={`/node/${p.node_id}`}
                  className="text-muted-foreground hover:underline break-all"
                >
                  {p.node_id}
                </NextLink>
              </TableCell>
              <TableCell>
                <RouterTunnelBadge
                  status={p.tunnel_status as "online" | "degraded" | "offline"}
                  compact
                />
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono tabular-nums text-sm",
                  p.concurrency > 0 &&
                    p.active_requests >= p.concurrency &&
                    "text-amber-600 dark:text-amber-400",
                )}
              >
                {formatCapacityRatio(p.active_requests, p.concurrency)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono tabular-nums text-sm",
                  p.queued_requests > 0 && "text-amber-600 dark:text-amber-400",
                )}
              >
                {p.queued_requests}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-sm">
                {p.available_slots}
              </TableCell>
              <TableCell className="text-xs">{p.quantization || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ModelsList({ providers }: { providers: ProviderOffering[] }) {
  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <div
          key={`${p.node_id}-${p.model_id}`}
          className="rounded-lg border bg-card p-3 space-y-2"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="min-w-0">
              <NextLink
                href={`/model?modelId=${encodeURIComponent(p.model_id)}`}
                className="font-mono text-xs text-primary hover:underline break-all"
              >
                {p.model_id}
              </NextLink>
              <p className="text-xs text-muted-foreground mt-1">
                <NextLink href={`/node/${p.node_id}`} className="hover:underline font-mono">
                  {p.node_id}
                </NextLink>
              </p>
            </div>
            <RouterTunnelBadge
              status={p.tunnel_status as "online" | "degraded" | "offline"}
              compact
            />
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-mono tabular-nums">
            <span
              className={cn(
                p.concurrency > 0 &&
                  p.active_requests >= p.concurrency &&
                  "text-amber-600 dark:text-amber-400",
              )}
            >
              {formatCapacityRatio(p.active_requests, p.concurrency)} active
            </span>
            <span
              className={cn(p.queued_requests > 0 && "text-amber-600 dark:text-amber-400")}
            >
              {p.queued_requests} queued
            </span>
            <span>{p.available_slots} slots</span>
            {p.quantization ? <span className="text-muted-foreground">{p.quantization}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export type TelemetryDashboardProps = {
  routerConfigured: boolean;
  loading: boolean;
  routerUnavailable: boolean;
  connected: boolean;
  telemetryError: string | null;
  nodes: NodeStatus[] | null;
  providers: ProviderOffering[] | null;
  routerUptimeSecs?: number;
};

export function TelemetryDashboard({
  routerConfigured,
  loading,
  routerUnavailable,
  connected,
  telemetryError,
  nodes,
  providers,
  routerUptimeSecs,
}: TelemetryDashboardProps) {
  const [nodeFilters, setNodeFilters] = useState<NodeTelemetryFilterState>(
    DEFAULT_NODE_TELEMETRY_FILTERS,
  );
  const [modelFilters, setModelFilters] = useState<ModelTelemetryFilterState>(
    DEFAULT_MODEL_TELEMETRY_FILTERS,
  );

  const allNodes = nodes ?? [];
  const allProviders = providers ?? [];

  const filteredNodes = useMemo(
    () => filterNodeTelemetry(allNodes, nodeFilters),
    [allNodes, nodeFilters],
  );
  const filteredProviders = useMemo(
    () => filterModelTelemetry(allProviders, modelFilters),
    [allProviders, modelFilters],
  );
  const modelFacets = useMemo(
    () => buildModelTelemetryFacets(allProviders),
    [allProviders],
  );

  const stats = useMemo(() => {
    const onlineNodes = allNodes.filter((n) => n.status === "online").length;
    const totalInFlight = allNodes.reduce((sum, n) => sum + n.in_flight_requests, 0);
    const queuedTotal = allProviders.reduce((sum, p) => sum + p.queued_requests, 0);
    const atCapacity = allProviders.filter(
      (p) => p.concurrency > 0 && p.active_requests >= p.concurrency,
    ).length;
    return { onlineNodes, totalInFlight, queuedTotal, atCapacity };
  }, [allNodes, allProviders]);

  if (!routerConfigured) {
    return (
      <Alert variant="warning">
        <AlertTitle>Router not configured</AlertTitle>
        <AlertDescription>
          Set{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
            NEXT_PUBLIC_SPARKL_ROUTER_URL
          </code>{" "}
          to enable live router telemetry.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {routerUnavailable ? (
        <Alert variant="warning">
          <AlertTitle>Router status unavailable</AlertTitle>
          <AlertDescription>
            Set{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
              SPARKL_ROUTER_URL
            </code>{" "}
            and{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
              SPARKL_ROUTER_ADMIN_TOKEN
            </code>{" "}
            on the portal server. Telemetry will retry automatically.
          </AlertDescription>
        </Alert>
      ) : null}

      {telemetryError ? (
        <Alert variant="warning">
          <AlertTitle>Telemetry stream error</AlertTitle>
          <AlertDescription>{telemetryError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-8 flex-wrap">
            <StatBlock label="Nodes" value={String(allNodes.length)} sub={`${stats.onlineNodes} online`} />
            <StatBlock
              label="Offerings"
              value={String(allProviders.length)}
              sub={`${stats.atCapacity} at capacity`}
            />
            <StatBlock label="In flight" value={String(stats.totalInFlight)} sub="Across nodes" />
            <StatBlock label="Queued" value={String(stats.queuedTotal)} sub="Model wait queue" />
            {routerUptimeSecs != null ? (
              <StatBlock
                label="Router uptime"
                value={`${routerUptimeSecs}s`}
                sub="From last status fetch"
              />
            ) : null}
          </div>
          <ConnectionBadge connected={connected} loading={loading} error={telemetryError} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Node telemetry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <NodeTelemetryToolbar
            filters={nodeFilters}
            patchFilters={(patch) => setNodeFilters((f) => ({ ...f, ...patch }))}
            resetFilters={() => setNodeFilters(DEFAULT_NODE_TELEMETRY_FILTERS)}
            totalCount={allNodes.length}
            filteredCount={filteredNodes.length}
          />
          {loading && allNodes.length === 0 ? (
            <Skeleton className="h-32 w-full" />
          ) : filteredNodes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {nodeFiltersAreActive(nodeFilters)
                ? "No nodes match the current filters."
                : "No node telemetry yet."}
            </p>
          ) : nodeFilters.viewMode === "table" ? (
            <NodesTable nodes={filteredNodes} />
          ) : (
            <NodesList nodes={filteredNodes} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Model capacity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ModelTelemetryToolbar
            filters={modelFilters}
            patchFilters={(patch) => setModelFilters((f) => ({ ...f, ...patch }))}
            resetFilters={() => setModelFilters(DEFAULT_MODEL_TELEMETRY_FILTERS)}
            facets={modelFacets}
            totalCount={allProviders.length}
            filteredCount={filteredProviders.length}
          />
          {loading && allProviders.length === 0 ? (
            <Skeleton className="h-32 w-full" />
          ) : filteredProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {modelFiltersAreActive(modelFilters)
                ? "No offerings match the current filters."
                : "No model capacity telemetry yet."}
            </p>
          ) : modelFilters.viewMode === "table" ? (
            <ModelsTable providers={filteredProviders} />
          ) : (
            <ModelsList providers={filteredProviders} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
