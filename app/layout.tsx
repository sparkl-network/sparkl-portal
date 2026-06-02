import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "./providers";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "Sparkl Portal",
  description: "Hub EVM portal — nodes, operator accounts, and consumer flows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
