import type { PersonalizationSettings } from "@/lib/personalization/types";

export function parseDateInput(
  value: string | number | Date | null | undefined,
): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTimeAgo(date: Date, nowMs = Date.now()): string {
  const secs = Math.floor((nowMs - date.getTime()) / 1000);
  if (secs < 0) return "in the future";
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  settings: PersonalizationSettings,
  nowMs?: number,
): string {
  const date = parseDateInput(value);
  if (!date) return "—";

  switch (settings.dateTimeMode) {
    case "utc":
      return `${date.toISOString().replace("T", " ").slice(0, 19)} UTC`;
    case "timeAgo":
      return formatTimeAgo(date, nowMs);
    case "locale":
    default:
      return date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      });
  }
}
