"use client";

import { LayoutGrid, List } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionListViewMode } from "@/lib/session/useSessionListViewMode";

type SessionListViewToggleProps = {
  viewMode: SessionListViewMode;
  onViewModeChange: (mode: SessionListViewMode) => void;
};

export function SessionListViewToggle({ viewMode, onViewModeChange }: SessionListViewToggleProps) {
  return (
    <div className="flex rounded-md border bg-background p-0.5">
      <Button
        type="button"
        size="sm"
        variant={viewMode === "card" ? "secondary" : "ghost"}
        className="h-8 px-2.5"
        aria-pressed={viewMode === "card"}
        onClick={() => onViewModeChange("card")}
        title="Card view"
      >
        <LayoutGrid className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        variant={viewMode === "list" ? "secondary" : "ghost"}
        className="h-8 px-2.5"
        aria-pressed={viewMode === "list"}
        onClick={() => onViewModeChange("list")}
        title="List view"
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}
