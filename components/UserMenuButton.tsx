"use client";

import { useState } from "react";
import { User } from "lucide-react";

import { UserPreferencesModal } from "@/components/UserPreferencesModal";
import { Button } from "@/components/ui/button";

export function UserMenuButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="compact"
        aria-label="Open preferences"
        title="Preferences"
        onClick={() => setOpen(true)}
        className="px-2"
      >
        <User className="h-4 w-4" aria-hidden />
      </Button>
      <UserPreferencesModal open={open} onOpenChange={setOpen} />
    </>
  );
}
