"use client";

import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_MODEL_CATALOG_FILTERS,
  loadModelCatalogFilters,
  saveModelCatalogFilters,
  type ModelCatalogFilterState,
} from "@/lib/router/modelCatalogFilters";

export function useModelCatalogFilters() {
  const [filters, setFilters] = useState<ModelCatalogFilterState>(
    DEFAULT_MODEL_CATALOG_FILTERS,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFilters(loadModelCatalogFilters());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveModelCatalogFilters(filters);
  }, [filters, hydrated]);

  const patchFilters = useCallback((patch: Partial<ModelCatalogFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters((prev) => ({
      ...DEFAULT_MODEL_CATALOG_FILTERS,
      viewMode: prev.viewMode,
    }));
  }, []);

  const toggleFeature = useCallback((key: string) => {
    setFilters((prev) => {
      const has = prev.featuresAny.includes(key);
      return {
        ...prev,
        featuresAny: has
          ? prev.featuresAny.filter((k) => k !== key)
          : [...prev.featuresAny, key],
      };
    });
  }, []);

  return {
    filters,
    setFilters,
    patchFilters,
    resetFilters,
    toggleFeature,
    hydrated,
  };
}
