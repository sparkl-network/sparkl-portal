"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { MediaQueryProvider, ThemeProvider } from "@coinbase/cds-web/system";
import { defaultTheme } from "@coinbase/cds-web/themes/defaultTheme";
import { Box } from "@coinbase/cds-web/layout";
import { PortalProvider } from "@coinbase/cds-web/overlays";
import { Text } from "@coinbase/cds-web/typography";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { type Config, WagmiProvider } from "wagmi";

import { AppToolbar } from "@/components/AppToolbar";
import { EscrowTrustFooter } from "@/components/EscrowTrustFooter";
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
    <MediaQueryProvider>
      <ThemeProvider theme={defaultTheme} activeColorScheme="light">
        <PortalProvider>
          {wagmi.status === "loading" ? (
            <Box paddingX={3} paddingY={3}>
              <Text font="body" color="fgMuted">
                Loading wallet…
              </Text>
            </Box>
          ) : wagmi.status === "error" ? (
            <Box paddingX={3} paddingY={3}>
              <Text font="body" color="fgMuted">
                {wagmi.message}
              </Text>
            </Box>
          ) : (
            <WagmiProvider config={wagmi.config}>
              <QueryClientProvider client={queryClient}>
                <RainbowKitProvider>
                  <div className="app-shell">
                    <div className="app-toolbar-sticky">
                      <AppToolbar />
                    </div>
                    <div className="app-main">{children}</div>
                    <EscrowTrustFooter />
                  </div>
                </RainbowKitProvider>
              </QueryClientProvider>
            </WagmiProvider>
          )}
        </PortalProvider>
      </ThemeProvider>
    </MediaQueryProvider>
  );

  return shell;
}
