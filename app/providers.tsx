"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { MediaQueryProvider, ThemeProvider } from "@coinbase/cds-web/system";
import { defaultTheme } from "@coinbase/cds-web/themes/defaultTheme";
import { Box } from "@coinbase/cds-web/layout";
import { Text } from "@coinbase/cds-web/typography";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { type Config, WagmiProvider } from "wagmi";

import { AppToolbar } from "@/components/AppToolbar";
import { EscrowTrustFooter } from "@/components/EscrowTrustFooter";
import { getHubWagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [wagmiConfig, setWagmiConfig] = useState<Config | null>(null);

  useEffect(() => {
    setWagmiConfig(getHubWagmiConfig());
  }, []);

  const shell = (
    <MediaQueryProvider>
      <ThemeProvider theme={defaultTheme} activeColorScheme="light">
        {!wagmiConfig ? (
          <Box paddingX={3} paddingY={3}>
            <Text font="body" color="fgMuted">
              Loading wallet…
            </Text>
          </Box>
        ) : (
          <WagmiProvider config={wagmiConfig}>
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
      </ThemeProvider>
    </MediaQueryProvider>
  );

  return shell;
}
