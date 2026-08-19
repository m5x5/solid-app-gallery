import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSolid } from "@/lib/solid-context";
import { requestAppDeletion } from "@/lib/solid-data";

// "Suggest removal" — any signed-in user can flag an app for the admin with a
// reason (dead link, duplicate, not a Solid app…). Sends a Flag to the admin
// inbox; the admin acts on it from the review queue.
export function SuggestRemoval({
  appId,
  appName,
  open: openProp,
  onOpenChange,
}: {
  appId: string;
  appName: string;
  // Controlled mode (e.g. opened from a menu item): no trigger is rendered.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { isLoggedIn, webId, login } = useSolid();
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  const setOpen = (v: boolean) => {
    if (!controlled) setOpenState(v);
    onOpenChange?.(v);
  };
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"sent" | "failed" | null>(null);

  async function send() {
    if (!webId || !reason.trim()) return;
    setBusy(true);
    const ok = await requestAppDeletion(webId, appId, reason.trim());
    setBusy(false);
    setDone(ok ? "sent" : "failed");
    if (ok) setReason("");
  }

  // The inbox only accepts authenticated appends, so route a signed-out
  // click straight to login instead of opening a form that can't be sent.
  // (Controlled + signed out: the parent "opened" it from a menu item.)
  useEffect(() => {
    if (controlled && open && !isLoggedIn) {
      onOpenChange?.(false);
      login();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, open, isLoggedIn]);

  if (!isLoggedIn) {
    if (controlled) return null;
    return (
      <Button variant="outline" onClick={() => login()} title="Log in to suggest removal">
        <Flag className="h-4 w-4" /> Suggest removal
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setDone(null);
      }}
    >
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <Flag className="h-4 w-4" /> Suggest removal
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suggest removing {appName}</DialogTitle>
          <DialogDescription>
            Tell the catalog admin why this entry should go — a dead or wrong link, a
            duplicate, not actually a Solid app, and so on. They'll review it.
          </DialogDescription>
        </DialogHeader>
        {done === "sent" ? (
          <p className="text-sm">
            Thanks — your suggestion was sent to the admin ✓
          </p>
        ) : (
          <>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why should this be removed?"
              rows={4}
              autoFocus
              data-testid="removal-reason"
            />
            {done === "failed" && (
              <p className="text-sm text-destructive">
                Couldn't reach the admin inbox — please try again.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={send} disabled={busy || !reason.trim()}>
                {busy ? "Sending…" : "Send suggestion"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
