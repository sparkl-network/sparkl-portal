import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.10.199",
    'portal-testnet.sparkl.network'
  ],
  async redirects() {
    return [
      { source: "/", destination: "/node", permanent: false },
      { source: "/provider", destination: "/operator", permanent: false },
      {
        source: "/provider/:operator",
        destination: "/operator/:operator",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
