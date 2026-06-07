import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadPersonalization,
  PERSONALIZATION_STORAGE_KEY,
  savePersonalization,
} from "@/lib/personalization/storage";
import { DEFAULT_PERSONALIZATION } from "@/lib/personalization/types";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("personalization storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns defaults when storage is empty", () => {
    expect(loadPersonalization()).toEqual(DEFAULT_PERSONALIZATION);
  });

  it("persists theme and date/time mode together", () => {
    savePersonalization({ dateTimeMode: "utc", theme: "dark" });
    expect(loadPersonalization()).toEqual({ dateTimeMode: "utc", theme: "dark" });
  });

  it("defaults theme when missing from stored JSON", () => {
    localStorage.setItem(
      PERSONALIZATION_STORAGE_KEY,
      JSON.stringify({ dateTimeMode: "timeAgo" }),
    );
    expect(loadPersonalization()).toEqual({
      dateTimeMode: "timeAgo",
      theme: "system",
    });
  });
});
