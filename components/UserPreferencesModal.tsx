"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePersonalization } from "@/lib/personalization/PersonalizationProvider";
import type { DateTimeDisplayMode, ThemePreference } from "@/lib/personalization/types";

const DATE_TIME_OPTIONS: {
  value: DateTimeDisplayMode;
  label: string;
  description: string;
  example: string;
}[] = [
  {
    value: "locale",
    label: "Locale",
    description: "Browser locale date and time (e.g. Jun 3, 2026, 7:41:47 PM).",
    example: new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }),
  },
  {
    value: "utc",
    label: "UTC",
    description: "ISO-style UTC timestamps (on-chain / router friendly).",
    example: `${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
  },
  {
    value: "timeAgo",
    label: "Time ago",
    description: "Relative times (e.g. 2m ago); updates every 30 seconds.",
    example: "just now",
  },
];

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
}[] = [
  {
    value: "system",
    label: "System",
    description: "Match your device light or dark setting.",
  },
  {
    value: "light",
    label: "Light",
    description: "Always use the light theme.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Always use the dark theme.",
  },
];

export function UserPreferencesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { settings, setDateTimeMode, setThemePreference } = usePersonalization();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>
            Saved in this browser only (localStorage). Affects theme and how dates
            and times are shown across the portal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Theme</Label>
            <RadioGroup
              value={settings.theme}
              onValueChange={(v) => setThemePreference(v as ThemePreference)}
              className="gap-3"
            >
              {THEME_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <RadioGroupItem
                    value={opt.value}
                    id={`theme-${opt.value}`}
                    className="mt-0.5"
                  />
                  <div className="space-y-1 min-w-0">
                    <Label htmlFor={`theme-${opt.value}`} className="font-medium cursor-pointer">
                      {opt.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-3">
          <Label className="text-sm font-medium">Date &amp; time display</Label>
          <RadioGroup
            value={settings.dateTimeMode}
            onValueChange={(v) => setDateTimeMode(v as DateTimeDisplayMode)}
            className="gap-3"
          >
            {DATE_TIME_OPTIONS.map((opt) => (
              <div
                key={opt.value}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <RadioGroupItem
                  value={opt.value}
                  id={`dt-${opt.value}`}
                  className="mt-0.5"
                />
                <div className="space-y-1 min-w-0">
                  <Label htmlFor={`dt-${opt.value}`} className="font-medium cursor-pointer">
                    {opt.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    Example: {opt.example}
                  </p>
                </div>
              </div>
            ))}
          </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
