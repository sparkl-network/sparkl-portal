import {
  DEFAULT_PERSONALIZATION,
  type DateTimeDisplayMode,
  type PersonalizationSettings,
  type ThemePreference,
} from "@/lib/personalization/types";

export const PERSONALIZATION_STORAGE_KEY = "sparkl-portal-personalization";

const DATE_TIME_MODES: DateTimeDisplayMode[] = ["utc", "locale", "timeAgo"];
const THEME_PREFERENCES: ThemePreference[] = ["light", "dark", "system"];

function isDateTimeMode(v: unknown): v is DateTimeDisplayMode {
  return typeof v === "string" && DATE_TIME_MODES.includes(v as DateTimeDisplayMode);
}

function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === "string" && THEME_PREFERENCES.includes(v as ThemePreference);
}

export function loadPersonalization(): PersonalizationSettings {
  if (typeof window === "undefined") return DEFAULT_PERSONALIZATION;
  try {
    const raw = localStorage.getItem(PERSONALIZATION_STORAGE_KEY);
    if (!raw) return DEFAULT_PERSONALIZATION;
    const parsed = JSON.parse(raw) as Partial<PersonalizationSettings>;
    return {
      dateTimeMode: isDateTimeMode(parsed.dateTimeMode)
        ? parsed.dateTimeMode
        : DEFAULT_PERSONALIZATION.dateTimeMode,
      theme: isThemePreference(parsed.theme)
        ? parsed.theme
        : DEFAULT_PERSONALIZATION.theme,
    };
  } catch {
    return DEFAULT_PERSONALIZATION;
  }
}

export function savePersonalization(settings: PersonalizationSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(settings));
}
