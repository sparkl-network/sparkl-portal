import type { ProviderOffering } from "@/lib/router/types";

export type ModelCatalogViewMode = "card" | "list";

export type ModelCatalogFilterState = {
  query: string;
  quantization: string;
  parameterCount: string;
  minContextLength: string;
  minAvailableSlots: string;
  minConcurrency: string;
  featuresAny: string[];
  onlineOnly: boolean;
  viewMode: ModelCatalogViewMode;
};

export const DEFAULT_MODEL_CATALOG_FILTERS: ModelCatalogFilterState = {
  query: "",
  quantization: "",
  parameterCount: "",
  minContextLength: "",
  minAvailableSlots: "",
  minConcurrency: "",
  featuresAny: [],
  onlineOnly: false,
  viewMode: "card",
};

const STORAGE_KEY = "sparkl-portal-model-catalog-filters";

function parseOptionalNonNegativeInt(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function isViewMode(v: unknown): v is ModelCatalogViewMode {
  return v === "card" || v === "list";
}

export function loadModelCatalogFilters(): ModelCatalogFilterState {
  if (typeof window === "undefined") return DEFAULT_MODEL_CATALOG_FILTERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MODEL_CATALOG_FILTERS;
    const parsed = JSON.parse(raw) as Partial<ModelCatalogFilterState>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      quantization: typeof parsed.quantization === "string" ? parsed.quantization : "",
      parameterCount:
        typeof parsed.parameterCount === "string" ? parsed.parameterCount : "",
      minContextLength:
        typeof parsed.minContextLength === "string" ? parsed.minContextLength : "",
      minAvailableSlots:
        typeof parsed.minAvailableSlots === "string" ? parsed.minAvailableSlots : "",
      minConcurrency:
        typeof parsed.minConcurrency === "string" ? parsed.minConcurrency : "",
      featuresAny: Array.isArray(parsed.featuresAny)
        ? parsed.featuresAny.filter((k): k is string => typeof k === "string")
        : [],
      onlineOnly: parsed.onlineOnly === true,
      viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : "card",
    };
  } catch {
    return DEFAULT_MODEL_CATALOG_FILTERS;
  }
}

export function saveModelCatalogFilters(state: ModelCatalogFilterState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function providerSearchHaystack(p: ProviderOffering): string {
  const parts = [
    p.model_id,
    p.quantization,
    p.parameter_count,
    p.source_url,
    p.node_id,
    ...Object.entries(p.features ?? {}).flatMap(([k, v]) => [k, v]),
  ];
  return parts.join(" ").toLowerCase();
}

export function providerMatchesFilters(
  p: ProviderOffering,
  filters: ModelCatalogFilterState,
): boolean {
  if (filters.onlineOnly && p.tunnel_status !== "online") return false;

  if (filters.quantization && p.quantization !== filters.quantization) return false;
  if (filters.parameterCount && p.parameter_count !== filters.parameterCount) {
    return false;
  }

  const minCtx = parseOptionalNonNegativeInt(filters.minContextLength);
  if (minCtx !== null && p.context_length < minCtx) return false;

  const minSlots = parseOptionalNonNegativeInt(filters.minAvailableSlots);
  if (minSlots !== null && p.available_slots < minSlots) return false;

  const minConcurrency = parseOptionalNonNegativeInt(filters.minConcurrency);
  if (minConcurrency !== null && p.concurrency < minConcurrency) return false;

  if (filters.featuresAny.length > 0) {
    const keys = Object.keys(p.features ?? {});
    if (!filters.featuresAny.some((k) => keys.includes(k))) return false;
  }

  const q = filters.query.trim().toLowerCase();
  if (q && !providerSearchHaystack(p).includes(q)) return false;

  return true;
}

export function filterProviderOfferings(
  providers: ProviderOffering[],
  filters: ModelCatalogFilterState,
): ProviderOffering[] {
  return providers.filter((p) => providerMatchesFilters(p, filters));
}

export type CatalogFilterFacets = {
  quantizations: string[];
  parameterCounts: string[];
  featureKeys: string[];
};

export function buildCatalogFilterFacets(
  providers: ProviderOffering[],
): CatalogFilterFacets {
  const quantizations = new Set<string>();
  const parameterCounts = new Set<string>();
  const featureKeys = new Set<string>();

  for (const p of providers) {
    if (p.quantization.trim()) quantizations.add(p.quantization);
    if (p.parameter_count.trim()) parameterCounts.add(p.parameter_count);
    for (const k of Object.keys(p.features ?? {})) featureKeys.add(k);
  }

  const sort = (a: string, b: string) => a.localeCompare(b);
  return {
    quantizations: [...quantizations].sort(sort),
    parameterCounts: [...parameterCounts].sort(sort),
    featureKeys: [...featureKeys].sort(sort),
  };
}

export function filtersAreActive(filters: ModelCatalogFilterState): boolean {
  const d = DEFAULT_MODEL_CATALOG_FILTERS;
  return (
    filters.query !== d.query ||
    filters.quantization !== d.quantization ||
    filters.parameterCount !== d.parameterCount ||
    filters.minContextLength !== d.minContextLength ||
    filters.minAvailableSlots !== d.minAvailableSlots ||
    filters.minConcurrency !== d.minConcurrency ||
    filters.featuresAny.length > 0 ||
    filters.onlineOnly !== d.onlineOnly
  );
}
