export type DateTimeDisplayMode = "utc" | "locale" | "timeAgo";

export type ThemePreference = "light" | "dark" | "system";

export type PersonalizationSettings = {
  dateTimeMode: DateTimeDisplayMode;
  theme: ThemePreference;
};

export const DEFAULT_PERSONALIZATION: PersonalizationSettings = {
  dateTimeMode: "locale",
  theme: "system",
};
