export default function ConsumerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div style={{ padding: "2rem", maxWidth: "48rem" }}>{children}</div>;
}
