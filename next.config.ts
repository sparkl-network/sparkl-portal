import path from "node:path";
import type { NextConfig } from "next";

const asyncStorageStub = path.join(
  process.cwd(),
  "lib/stubs/async-storage.ts",
);

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": asyncStorageStub,
    };
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      // WalletConnect / viem tempo chain — dynamic require, safe to ignore on web.
      { module: /[\\/]ox[\\/]_esm[\\/]tempo[\\/]/ },
    ];
    return config;
  },
  allowedDevOrigins: [
    "192.168.10.199",
    'portal-testnet.sparkl.network'
  ],
  async redirects() {
    return [
      { source: "/provider", destination: "/operator", permanent: false },
      {
        source: "/provider/:operator",
        destination: "/operator/:operator",
        permanent: false,
      },
      { source: "/sessions", destination: "/user/session", permanent: false },
      {
        source: "/sessions/:sessionId",
        destination: "/user/session/:sessionId",
        permanent: false,
      },
      {
        source: "/node/:nodeId/sessions",
        destination: "/node/:nodeId/session",
        permanent: false,
      },
      {
        source: "/node/:nodeId/sessions/:sessionId",
        destination: "/node/:nodeId/session/:sessionId",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
