import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useSolid } from "@/lib/solid-context";
import { requestModerator } from "@/lib/solid-data";
import { ADMIN_MATRIX } from "@/config";

// "Become a moderator" — asks visitors to sign in first (the request has to
// come from a WebID), then sends a moderator request to the admin's inbox with
// an optional note. Moderators can publish uploads/submissions and act on
// deletion requests, so this stays a manual approval.
export function ModeratorRequest() {
  const { isLoggedIn, webId, isAdmin, login } = useSolid();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "sent" | "failed">("idle");

  async function send() {
    if (!webId) return;
    setBusy(true);
    const ok = await requestModerator(webId, message.trim());
    setBusy(false);
    setState(ok ? "sent" : "failed");
  }

  return (
    <div className="mt-10 rounded-2xl border border-border bg-card p-6" data-testid="moderator-request">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Become a moderator</h2>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Moderators review submitted apps and screenshots, publish them to the catalog and handle
        removal requests. Access is tied to your WebID.
      </p>

      {isAdmin ? (
        <p className="mt-4 text-sm">You already have moderator access — thank you!</p>
      ) : !isLoggedIn ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => login()}>Log in to request access</Button>
          <span className="text-sm text-muted-foreground">
            Sign in with your Solid WebID first — the request is made on its behalf.
          </span>
        </div>
      ) : state === "sent" ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className="font-medium">Request sent ✓</p>
          <p className="text-muted-foreground">
            I'll look at it and add your WebID to the moderators group — usually within 24 hours.
            {ADMIN_MATRIX && (
              <>
                {" "}
                If it's urgent, ping me on Matrix at{" "}
                <a
                  href={`https://matrix.to/#/${ADMIN_MATRIX}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline"
                >
                  {ADMIN_MATRIX}
                </a>{" "}
                and I'll do it faster.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="mt-4 max-w-2xl space-y-3">
          <p className="text-sm text-muted-foreground">
            Send a request from <span className="font-medium text-foreground">{webId}</span>. I review
            every request personally and try to respond within 24 hours
            {ADMIN_MATRIX && (
              <>
                {" "}— or message me on Matrix at{" "}
                <a
                  href={`https://matrix.to/#/${ADMIN_MATRIX}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline"
                >
                  {ADMIN_MATRIX}
                </a>{" "}
                to speed it up
              </>
            )}
            .
          </p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Optional: who you are and why you'd like to help moderate."
          />
          {state === "failed" && (
            <p className="text-sm text-destructive">Couldn't reach the admin inbox — please try again.</p>
          )}
          <Button onClick={send} disabled={busy}>
            {busy ? "Sending…" : "Request moderator access"}
          </Button>
        </div>
      )}
    </div>
  );
}
