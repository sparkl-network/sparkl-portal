"use client";

import { useMemo } from "react";

import { type HubChainConfig, getActiveChainConfig } from "@/lib/chains";

export function useHubChainConfig(): {
  hubConfig: HubChainConfig | null;
  configError: string | null;
} {
  return useMemo(() => {
    try {
      return {
        hubConfig: getActiveChainConfig(),
        configError: null,
      };
    } catch (e) {
      return {
        hubConfig: null,
        configError:
          e instanceof Error ? e.message : "Invalid chain configuration",
      };
    }
  }, []);
}
