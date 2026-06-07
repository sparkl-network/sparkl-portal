"use client";

import { usePersonalization } from "@/lib/personalization/PersonalizationProvider";

export function FormattedDateTime({
  value,
  className,
  title,
}: {
  value: string | number | Date | null | undefined;
  className?: string;
  /** Shown on hover; defaults to raw value when present. */
  title?: string;
}) {
  const { formatDate, hydrated } = usePersonalization();
  if (value == null || value === "") {
    return <span className={className}>—</span>;
  }
  const formatted = hydrated ? formatDate(value) : String(value);
  const hoverTitle = title ?? (typeof value === "string" ? value : undefined);
  return (
    <span className={className} title={hoverTitle}>
      {formatted}
    </span>
  );
}
