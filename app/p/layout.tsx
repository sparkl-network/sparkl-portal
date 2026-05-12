export default function ProviderLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div style={{ padding: "2rem", maxWidth: "48rem" }}>{children}</div>;
}
