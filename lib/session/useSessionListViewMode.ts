"use client";

import { useCallback, useEffect, useState } from "react";

export type SessionListViewMode = "card" | "list";

const STORAGE_KEY = "sparkl-portal-session-list-view-mode";
const DEFAULT: SessionListViewMode = "card";

function loadViewMode(): SessionListViewMode {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "list" || raw === "card") return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

export function useSessionListViewMode() {
  const [viewMode, setViewMode] = useState<SessionListViewMode>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setViewMode(loadViewMode());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode, hydrated]);

  const patchViewMode = useCallback((mode: SessionListViewMode) => {
    setViewMode(mode);
  }, []);

  return { viewMode, patchViewMode, hydrated };
}
