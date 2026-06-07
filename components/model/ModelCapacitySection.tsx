"use client";

import { useMemo } from "react";
import { LayoutGrid, List } from "lucide-react";

import { RouterTunnelBadge } from "@/components/router/RouterTunnelBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { groupProvidersByModelId } from "@/lib/router/merge";
import { formatCapacityRatio } from "@/lib/router/telemetry";
import {
  buildCatalogFilterFacets,
  filterProviderOfferings,
  filtersAreActive,
  type ModelCatalogFilterState,
} from "@/lib/router/modelCatalogFilters";
import { useModelCatalogFilters } from "@/lib/router/useModelCatalogFilters";
import type { ModelCapacityAggregate, ProviderOffering } from "@/lib/router/types";
import { cn } from "@/lib/utils";

type ModelCapacitySectionProps = {
  providers: ProviderOffering[];
  catalogFetching: boolean;
  catalogError: boolean;
  catalogErr: unknown;
  oracleModelIds: Set<string>;
  featureDescriptions: Map<string, string>;
  telemetryConnected?: boolean;
  telemetryError?: string | null;
};

function aggregateMetrics(row: ModelCapacityAggregate) {
  const maxContext = Math.max(0, ...row.providers.map((p) => p.context_length));
  const maxConcurrency = Math.max(0, ...row.providers.map((p) => p.concurrency));
  const parameterCount =
    row.providers.find((p) => p.parameter_count.trim())?.parameter_count ?? "";
  const sourceUrl = row.providers.find((p) => p.source_url.trim())?.source_url ?? "";
  return { maxContext, maxConcurrency, parameterCount, sourceUrl };
}

function ModelCapacityToolbar({
  filters,
  patchFilters,
  resetFilters,
  toggleFeature,
  facets,
  totalCount,
  filteredCount,
  featureDescriptions,
}: {
  filters: ModelCatalogFilterState;
  patchFilters: (patch: Partial<ModelCatalogFilterState>) => void;
  resetFilters: () => void;
  toggleFeature: (key: string) => void;
  facets: ReturnType<typeof buildCatalogFilterFacets>;
  totalCount: number;
  filteredCount: number;
  featureDescriptions: Map<string, string>;
}) {
  const active = filtersAreActive(filters);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-1 space-y-1 min-w-0">
          <Label htmlFor="model-catalog-search" className="text-xs text-muted-foreground">
            Search
          </Label>
          <Input
            id="model-catalog-search"
            placeholder="Model id, quantization, params, features, node…"
            value={filters.query}
            onChange={(e) => patchFilters({ query: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-md border bg-background p-0.5">
            <Button
              type="button"
              size="sm"
              variant={filters.viewMode === "card" ? "secondary" : "ghost"}
              className="h-8 px-2.5"
              aria-pressed={filters.viewMode === "card"}
              onClick={() => patchFilters({ viewMode: "card" })}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filters.viewMode === "list" ? "secondary" : "ghost"}
              className="h-8 px-2.5"
              aria-pressed={filters.viewMode === "list"}
              onClick={() => patchFilters({ viewMode: "list" })}
              title="List view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Quantization</Label>
          <Select
            value={filters.quantization || "__any__"}
            onValueChange={(v) =>
              patchFilters({ quantization: v === "__any__" ? "" : v })
            }
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
          <Label className="text-xs text-muted-foreground">Parameter count</Label>
          <Select
            value={filters.parameterCount || "__any__"}
            onValueChange={(v) =>
              patchFilters({ parameterCount: v === "__any__" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any</SelectItem>
              {facets.parameterCounts.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="min-context" className="text-xs text-muted-foreground">
            Min context length
          </Label>
          <Input
            id="min-context"
            type="number"
            min={0}
            placeholder="Any"
            value={filters.minContextLength}
            onChange={(e) => patchFilters({ minContextLength: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="min-slots" className="text-xs text-muted-foreground">
            Min available slots
          </Label>
          <Input
            id="min-slots"
            type="number"
            min={0}
            placeholder="Any"
            value={filters.minAvailableSlots}
            onChange={(e) => patchFilters({ minAvailableSlots: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="min-concurrency" className="text-xs text-muted-foreground">
            Min concurrency
          </Label>
          <Input
            id="min-concurrency"
            type="number"
            min={0}
            placeholder="Any"
            value={filters.minConcurrency}
            onChange={(e) => patchFilters({ minConcurrency: e.target.value })}
          />
        </div>
        <div className="flex items-end gap-2 pb-0.5">
          <Checkbox
            id="online-only"
            checked={filters.onlineOnly}
            onCheckedChange={(c) => patchFilters({ onlineOnly: c === true })}
          />
          <Label htmlFor="online-only" className="text-sm font-normal cursor-pointer">
            Online tunnels only
          </Label>
        </div>
      </div>

      {facets.featureKeys.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Features (any)</Label>
          <div className="flex flex-wrap gap-2">
            {facets.featureKeys.map((key) => {
              const selected = filters.featuresAny.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                  )}
                  title={featureDescriptions.get(key)}
                  onClick={() => toggleFeature(key)}
                >
                  <Checkbox checked={selected} className="pointer-events-none h-3.5 w-3.5" />
                  {key}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing{" "}
          <span className="font-mono tabular-nums text-foreground">{filteredCount}</span> of{" "}
          <span className="font-mono tabular-nums">{totalCount}</span> models
          {active ? " (filtered)" : ""}
        </span>
        {active && (
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={resetFilters}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

function ModelCapacityCard({
  row,
  hasOracle,
  featureDescriptions,
}: {
  row: ModelCapacityAggregate;
  hasOracle: boolean;
  featureDescriptions: Map<string, string>;
}) {
  const { maxContext, maxConcurrency, parameterCount, sourceUrl } = aggregateMetrics(row);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-mono text-sm break-all">{row.modelId}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 text-sm">
        <p className="text-muted-foreground">
          {row.providers.length} provider(s) · {row.onlineCount} online ·{" "}
          <span className="font-mono tabular-nums">{row.totalAvailableSlots}</span> slots available
        </p>
        {(parameterCount || row.sampleQuantization || maxContext > 0 || maxConcurrency > 0) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {parameterCount && <p>Parameters: {parameterCount}</p>}
            {row.sampleQuantization && <p>Quantization: {row.sampleQuantization}</p>}
            {maxContext > 0 && (
              <p>
                Context: <span className="font-mono tabular-nums">{maxContext.toLocaleString()}</span>
              </p>
            )}
            {maxConcurrency > 0 && (
              <p>
                Concurrency: <span className="font-mono tabular-nums">{maxConcurrency}</span>
              </p>
            )}
          </div>
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline break-all"
          >
            Source
          </a>
        )}
        {row.featureKeys.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {row.featureKeys.map((k) => (
              <Badge
                key={k}
                variant="secondary"
                className="text-[10px]"
                title={featureDescriptions.get(k)}
              >
                {k}
              </Badge>
            ))}
          </div>
        )}
        <div className="space-y-1 pt-1 border-t">
          {row.providers.slice(0, 4).map((p) => (
            <div
              key={`${p.node_id}-${p.model_id}`}
              className="flex items-center justify-between gap-2 text-xs font-mono"
            >
              <span className="truncate text-muted-foreground">{p.node_id.slice(0, 12)}…</span>
              <RouterTunnelBadge
                status={p.tunnel_status as "online" | "degraded" | "offline"}
                compact
              />
              <span
                className={cn(
                  "tabular-nums",
                  p.queued_requests > 0 && "text-amber-600 dark:text-amber-400",
                )}
              >
                {formatCapacityRatio(p.active_requests, p.concurrency)}
                {p.queued_requests > 0 ? ` +${p.queued_requests}q` : ""}
              </span>
            </div>
          ))}
          {row.providers.length > 4 && (
            <p className="text-xs text-muted-foreground">+{row.providers.length - 4} more providers</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {hasOracle
            ? "On-chain price override exists"
            : "No on-chain price override (uses network default)"}
        </p>
      </CardContent>
    </Card>
  );
}

function ModelCapacityList({
  rows,
  oracleModelIds,
  featureDescriptions,
}: {
  rows: ModelCapacityAggregate[];
  oracleModelIds: Set<string>;
  featureDescriptions: Map<string, string>;
}) {
  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Params</TableHead>
            <TableHead>Quantization</TableHead>
            <TableHead className="text-right">Context</TableHead>
            <TableHead className="text-right">Concurrency</TableHead>
            <TableHead className="text-right">Slots</TableHead>
            <TableHead>Providers</TableHead>
            <TableHead>Features</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const { maxContext, maxConcurrency, parameterCount } = aggregateMetrics(row);
            const hasOracle = oracleModelIds.has(row.modelId.toLowerCase());
            return (
              <TableRow key={row.modelId}>
                <TableCell className="font-mono text-xs max-w-[220px]">
                  <div className="break-all">{row.modelId}</div>
                  {hasOracle && (
                    <span className="text-[10px] text-muted-foreground">oracle price</span>
                  )}
                </TableCell>
                <TableCell className="text-xs">{parameterCount || "—"}</TableCell>
                <TableCell className="text-xs">{row.sampleQuantization || "—"}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-xs">
                  {maxContext > 0 ? maxContext.toLocaleString() : "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-xs">
                  {maxConcurrency > 0 ? maxConcurrency : "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-xs">
                  {row.totalAvailableSlots}
                  <span className="block text-[10px] text-muted-foreground">
                    {row.onlineCount} online
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.providers.length}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {row.featureKeys.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      row.featureKeys.map((k) => (
                        <Badge
                          key={k}
                          variant="secondary"
                          className="text-[10px]"
                          title={featureDescriptions.get(k)}
                        >
                          {k}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function ModelCapacitySection({
  providers,
  catalogFetching,
  catalogError,
  catalogErr,
  oracleModelIds,
  featureDescriptions,
  telemetryConnected,
  telemetryError,
}: ModelCapacitySectionProps) {
  const { filters, patchFilters, resetFilters, toggleFeature } = useModelCatalogFilters();

  const facets = useMemo(() => buildCatalogFilterFacets(providers), [providers]);

  const filteredProviders = useMemo(
    () => filterProviderOfferings(providers, filters),
    [providers, filters],
  );

  const capacityByModel = useMemo(
    () => groupProvidersByModelId(filteredProviders),
    [filteredProviders],
  );

  const capacityRows = useMemo(
    () => [...capacityByModel.values()].sort((a, b) => a.modelId.localeCompare(b.modelId)),
    [capacityByModel],
  );

  const totalModelCount = useMemo(() => {
    const ids = new Set(providers.map((p) => p.model_id));
    return ids.size;
  }, [providers]);

  return (
    <div className="space-y-4">
      {telemetryError && (
        <Alert variant="warning">
          <AlertTitle>Live telemetry unavailable</AlertTitle>
          <AlertDescription>{telemetryError}</AlertDescription>
        </Alert>
      )}
      {telemetryConnected && (
        <p className="text-xs text-muted-foreground">Live capacity via router WebSocket</p>
      )}
      {catalogError && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>Router catalog unavailable</AlertTitle>
          <AlertDescription>
            {catalogErr instanceof Error ? catalogErr.message : "Could not load /v1/catalog/providers"}
          </AlertDescription>
        </Alert>
      )}

      {catalogFetching && providers.length === 0 ? (
        <Skeleton className="h-[120px] w-full" />
      ) : null}

      {!catalogFetching && !catalogError && providers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No provider offerings in router catalog yet.</p>
      ) : null}

      {providers.length > 0 && (
        <>
          <ModelCapacityToolbar
            filters={filters}
            patchFilters={patchFilters}
            resetFilters={resetFilters}
            toggleFeature={toggleFeature}
            facets={facets}
            totalCount={totalModelCount}
            filteredCount={capacityRows.length}
            featureDescriptions={featureDescriptions}
          />

          {!catalogFetching && capacityRows.length === 0 && filtersAreActive(filters) ? (
            <p className="text-sm text-muted-foreground">
              No models match the current filters. Try clearing filters or broadening search.
            </p>
          ) : null}

          {capacityRows.length > 0 && filters.viewMode === "card" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {capacityRows.map((row) => (
                <ModelCapacityCard
                  key={row.modelId}
                  row={row}
                  hasOracle={oracleModelIds.has(row.modelId.toLowerCase())}
                  featureDescriptions={featureDescriptions}
                />
              ))}
            </div>
          ) : null}

          {capacityRows.length > 0 && filters.viewMode === "list" ? (
            <ModelCapacityList
              rows={capacityRows}
              oracleModelIds={oracleModelIds}
              featureDescriptions={featureDescriptions}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
