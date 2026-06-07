import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/personalization/formatDateTime";
import { DEFAULT_PERSONALIZATION } from "@/lib/personalization/types";

describe("formatDateTime", () => {
  const sample = new Date("2026-06-03T19:41:47.000Z");

  it("formats UTC", () => {
    expect(
      formatDateTime(sample, { ...DEFAULT_PERSONALIZATION, dateTimeMode: "utc" }),
    ).toBe("2026-06-03 19:41:47 UTC");
  });

  it("formats timeAgo", () => {
    const now = sample.getTime() + 120_000;
    expect(
      formatDateTime(
        sample,
        { ...DEFAULT_PERSONALIZATION, dateTimeMode: "timeAgo" },
        now,
      ),
    ).toBe("2m ago");
  });
});
