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

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SessionRecoveryHelpModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lost vs compromised API keys</DialogTitle>
        </DialogHeader>
        <DialogDescription asChild>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Lost key (same session)</p>
            <p className="text-sm text-muted-foreground">
              If you only misplaced your API key and do not suspect theft, use
              "Show API key again" on an open session. The router re-issues the
              same credential when the session is still open on-chain.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Compromised key</p>
            <p className="text-sm text-muted-foreground">
              If someone else may have your key, do not re-activate the old
              session. Close or migrate: settle the old session on-chain, open a
              new session (new session id), then activate to receive a new API key.
              Until the old session is settled, the attacker can still call the
              router with the old key.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Close session</p>
            <p className="text-sm text-muted-foreground">
              One transaction: remits the remaining lock to provider escrow credit
              and your internal DOT balance. The session is marked settled; API
              keys for that session stop working.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Migrate session</p>
            <p className="text-sm text-muted-foreground">
              Two wallet transactions plus activate: settle the old session, open
              a new deposit on the same or another node, then activate the new
              session for a fresh key.
            </p>
          </div>
          </div>
        </DialogDescription>
        <DialogFooter>
          <Button onClick={onClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
