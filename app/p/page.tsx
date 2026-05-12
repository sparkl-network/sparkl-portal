import Link from "next/link";

export default function ProviderHome() {
  return (
    <>
      <p style={{ marginBottom: "1rem", opacity: 0.85 }}>
        <Link href="/">← Home</Link>
      </p>
      <h1 style={{ marginBottom: "0.5rem" }}>Provider</h1>
      <p style={{ opacity: 0.85 }}>
        Use <code>lib/evm/registry.ts</code> and <code>lib/evm/escrow.ts</code>{" "}
        from client components with wagmi&apos;s public and wallet clients.
      </p>
    </>
  );
}
