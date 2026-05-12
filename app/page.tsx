"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "2rem", maxWidth: "40rem" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>Sparkl Portal</h1>
      <p style={{ marginBottom: "1.25rem", opacity: 0.85 }}>
        Connect a Hub EVM wallet, then build provider flows under{" "}
        <code>/p</code> and consumer flows under <code>/c</code>.
      </p>
      <ConnectButton />
      <nav
        style={{
          marginTop: "1.75rem",
          display: "flex",
          gap: "1.25rem",
          flexWrap: "wrap",
        }}
      >
        <Link href="/p">Provider area (/p)</Link>
        <Link href="/c">Consumer area (/c)</Link>
      </nav>
    </main>
  );
}
