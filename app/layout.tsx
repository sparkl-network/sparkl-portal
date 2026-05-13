import "@coinbase/cds-icons/fonts/web/icon-font.css";
import "@coinbase/cds-web/globalStyles";
import "@coinbase/cds-web/defaultFontStyles";

import type { Metadata } from "next";

import "./globals.css";
import { Providers } from "./providers";

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
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
