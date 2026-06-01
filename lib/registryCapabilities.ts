export type RegistryCapabilities = {
  supportsBestEffort: boolean;
  supportsTEE: boolean;
  teeReportHash: string | null;
};

/** `GET /identity` → `registry_capabilities` from sparkl-solo. */
export function parseRegistryCapabilities(
  body: unknown,
): RegistryCapabilities | null {
  if (!body || typeof body !== "object") return null;
  const caps = (body as Record<string, unknown>).registry_capabilities;
  if (!caps || typeof caps !== "object") return null;
  const o = caps as Record<string, unknown>;

  const supportsBestEffort = o.supports_best_effort;
  const supportsTEE = o.supports_tee;
  if (typeof supportsBestEffort !== "boolean" || typeof supportsTEE !== "boolean") {
    return null;
  }

  let teeReportHash: string | null = null;
  const raw = o.tee_report_hash;
  if (typeof raw === "string" && raw.trim()) {
    teeReportHash = raw.trim();
  } else if (raw === null || raw === undefined) {
    teeReportHash = null;
  } else {
    return null;
  }

  return { supportsBestEffort, supportsTEE, teeReportHash };
}
