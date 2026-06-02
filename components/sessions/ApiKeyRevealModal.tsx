"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  sessionId: string;
  title?: string;
  description?: string;
};

export function ApiKeyRevealModal({
  open,
  onClose,
  apiKey,
  sessionId,
  title = "API key",
  description = "Copy this key now. It is not stored in the portal and cannot be shown again unless you run “Show API key again” on an open session.",
}: Props) {
  const [copied, setCopied] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="flex flex-col gap-1">
          <p>{description}</p>
          <span className="text-xs text-muted-foreground">Session {sessionId}</span>
          <Input value={apiKey} readOnly className="font-mono" />
          <span className="text-xs text-muted-foreground">
            Use as OpenAI SDK apiKey with base URL set to your Sparkl router URL.
          </span>
        </DialogDescription>
        <DialogFooter>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(apiKey);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy key"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
