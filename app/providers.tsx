"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { type Config, WagmiProvider } from "wagmi";

import { AppToolbar } from "@/components/AppToolbar";
import { EscrowTrustFooter } from "@/components/EscrowTrustFooter";
import { PersonalizationProvider } from "@/lib/personalization/PersonalizationProvider";
import { RouterProvider } from "@/lib/router/RouterProvider";
import { getHubWagmiConfig } from "@/lib/wagmi";

type WagmiBootstrap =
  | { status: "loading" }
  | { status: "ok"; config: Config }
  | { status: "error"; message: string };

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [wagmi, setWagmi] = useState<WagmiBootstrap>({ status: "loading" });

  useEffect(() => {
    try {
      setWagmi({
        status: "ok",
        config: getHubWagmiConfig(window.location.origin),
      });
    } catch (e) {
      setWagmi({
        status: "error",
        message:
          e instanceof Error ? e.message : "Wallet configuration failed",
      });
    }
  }, []);

  const shell = (
    <>
      {wagmi.status === "loading" ? (
        <div className="p-3">
          <span className="text-sm text-muted-foreground">Loading wallet…</span>
        </div>
      ) : wagmi.status === "error" ? (
        <div className="p-3">
          <span className="text-sm text-muted-foreground">{wagmi.message}</span>
        </div>
      ) : (
        <WagmiProvider config={wagmi.config}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider>
              <PersonalizationProvider>
                <RouterProvider>
                  <div className="app-shell">
                    <div className="app-toolbar-sticky">
                      <AppToolbar />
                    </div>
                    <div className="app-main">{children}</div>
                    <EscrowTrustFooter />
                  </div>
                </RouterProvider>
              </PersonalizationProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      )}
    </>
  );

  return shell;
}
