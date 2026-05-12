import Link from "next/link";

export default function ConsumerHome() {
  return (
    <>
      <p style={{ marginBottom: "1rem", opacity: 0.85 }}>
        <Link href="/">← Home</Link>
      </p>
      <h1 style={{ marginBottom: "0.5rem" }}>Consumer</h1>
      <p style={{ opacity: 0.85 }}>
        Escrow helpers live in <code>lib/evm/escrow.ts</code>; registry reads
        in <code>lib/evm/registry.ts</code>.
      </p>
    </>
  );
}
