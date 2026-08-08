import { useEffect, useState, useCallback } from "react";
import { Send, Lock, Globe } from "lucide-react";
import { useSolid } from "@/lib/solid-context";
import { currentWebId } from "@/lib/solid-auth";
import {
  loadComments,
  addComment,
  type Comment,
} from "@/lib/solid-data";
import { cn } from "@/lib/utils";

type Tab = "all" | "private";

function webIdLabel(webId?: string): string {
  if (!webId) return "You";
  try {
    const u = new URL(webId);
    return u.pathname.split("/").filter(Boolean)[0] || u.host;
  } catch {
    return "You";
  }
}

export function Comments({ screenId }: { screenId: string }) {
  const { isLoggedIn, webId, login } = useSolid();
  const [tab, setTab] = useState<Tab>("all");
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    loadComments(screenId, webId)
      .then(setComments)
      .finally(() => setLoading(false));
  }, [screenId, webId]);

  useEffect(refresh, [refresh]);

  const visible = comments.filter((c) =>
    tab === "private" ? c.visibility === "private" : c.visibility === "public"
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    // Read the live session WebID (the React `isLoggedIn` flag can briefly lag
    // during a token refresh, which would wrongly trigger a re-login redirect).
    const wid = currentWebId() || webId;
    if (!wid) {
      login();
      return;
    }
    const value = text.trim();
    setText(""); // clear immediately so a follow-up comment isn't clobbered
    setBusy(true);
    setError("");
    try {
      const c = await addComment(
        wid,
        webIdLabel(wid),
        screenId,
        value,
        tab === "private" ? "private" : "public"
      );
      setComments((prev) => [...prev, c]);
    } catch (err) {
      setError((err as Error).message || "Could not post comment.");
      setText(value); // restore so the user can retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5">
        <h2 className="text-lg font-semibold">Comments</h2>
        {/* All / Private segmented toggle */}
        <div className="mt-3 flex rounded-full bg-secondary p-1">
          {(["all", "private"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-full py-1.5 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* comment list */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="mt-16 px-4 text-center">
            <p className="font-semibold">
              {tab === "private" ? "Private notes" : "Start a public discussion"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === "private"
                ? "Only you and the admin can see private notes."
                : "Let others know what you think about the design."}
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {visible.map((c) => (
              <li key={c.id} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase">
                  {c.authorLabel.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {c.authorLabel}
                    </span>
                    {c.visibility === "private" ? (
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Globe className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.created).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/90">
                    {c.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="px-5 pb-1 text-xs text-destructive" data-testid="comment-error">
          {error}
        </p>
      )}

      {/* composer */}
      <form onSubmit={submit} className="border-t border-border p-4">
        <div className="rounded-xl border border-border bg-secondary/40 p-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              tab === "private" ? "Add a private note…" : "Start a discussion…"
            }
            rows={2}
            data-testid="comment-input"
            className="w-full resize-none bg-transparent px-2 py-1 text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center justify-between px-1">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {tab === "private" ? (
                <>
                  <Lock className="h-3 w-3" /> Private
                </>
              ) : (
                <>
                  <Globe className="h-3 w-3" /> Public
                </>
              )}
            </span>
            <button
              type="submit"
              disabled={busy || !text.trim()}
              data-testid="comment-submit"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {isLoggedIn ? "Post" : "Log in"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
