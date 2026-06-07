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
import { useTheme } from "next-themes";

import { formatDateTime } from "@/lib/personalization/formatDateTime";
import {
  loadPersonalization,
  PERSONALIZATION_STORAGE_KEY,
  savePersonalization,
} from "@/lib/personalization/storage";
import {
  DEFAULT_PERSONALIZATION,
  type DateTimeDisplayMode,
  type PersonalizationSettings,
  type ThemePreference,
} from "@/lib/personalization/types";

type PersonalizationContextValue = {
  settings: PersonalizationSettings;
  hydrated: boolean;
  setDateTimeMode: (mode: DateTimeDisplayMode) => void;
  setThemePreference: (theme: ThemePreference) => void;
  formatDate: (
    value: string | number | Date | null | undefined,
  ) => string;
};

const PersonalizationContext = createContext<PersonalizationContextValue | null>(
  null,
);

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const { setTheme } = useTheme();
  const [settings, setSettings] = useState<PersonalizationSettings>(
    DEFAULT_PERSONALIZATION,
  );
  const [hydrated, setHydrated] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const loaded = loadPersonalization();
    setSettings(loaded);
    setTheme(loaded.theme);
    setHydrated(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === PERSONALIZATION_STORAGE_KEY) {
        const next = loadPersonalization();
        setSettings(next);
        setTheme(next.theme);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setTheme]);

  useEffect(() => {
    if (settings.dateTimeMode !== "timeAgo") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [settings.dateTimeMode]);

  const setDateTimeMode = useCallback((mode: DateTimeDisplayMode) => {
    setSettings((prev) => {
      const next = { ...prev, dateTimeMode: mode };
      savePersonalization(next);
      return next;
    });
  }, []);

  const setThemePreference = useCallback(
    (theme: ThemePreference) => {
      setSettings((prev) => {
        const next = { ...prev, theme };
        savePersonalization(next);
        return next;
      });
      setTheme(theme);
    },
    [setTheme],
  );

  const formatDate = useCallback(
    (value: string | number | Date | null | undefined) =>
      formatDateTime(value, settings, nowMs),
    [settings, nowMs],
  );

  const value = useMemo(
    () => ({ settings, hydrated, setDateTimeMode, setThemePreference, formatDate }),
    [settings, hydrated, setDateTimeMode, setThemePreference, formatDate],
  );

  return (
    <PersonalizationContext.Provider value={value}>
      {children}
    </PersonalizationContext.Provider>
  );
}

export function usePersonalization(): PersonalizationContextValue {
  const ctx = useContext(PersonalizationContext);
  if (!ctx) {
    throw new Error("usePersonalization must be used within PersonalizationProvider");
  }
  return ctx;
}
