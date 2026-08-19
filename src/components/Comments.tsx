import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Send, Lock, Globe, Trash2, RefreshCw } from "lucide-react";
import { useSolid } from "@/lib/solid-context";
import { currentWebId } from "@/lib/solid-auth";
import {
  loadComments,
  addComment,
  deleteComment,
  type Comment,
} from "@/lib/solid-data";
import { getProfileInfo } from "@/lib/avatars";
import { AuthorAvatar } from "@/components/AuthorAvatar";
import { cn } from "@/lib/utils";

type Tab = "all" | "private";

// Stable DOM id for a comment (its resource URL) — used for deep links.
function commentDomId(url: string): string {
  return url.replace(/[^a-zA-Z0-9]+/g, "-").slice(-80);
}

function webIdLabel(webId?: string): string {
  if (!webId) return "You";
  try {
    const u = new URL(webId);
    return u.pathname.split("/").filter(Boolean)[0] || u.host;
  } catch {
    return "You";
  }
}

// Resolve each commenter's display name (vcard:fn / foaf:name) from their
// WebID profile via the shared, persisted profile cache (lib/avatars.ts) —
// one fetch per author, shared with the avatar. Older comments stored only the
// pod handle as their label, so the label is just the fallback.
function useAuthorNames(comments: Comment[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const authors = [...new Set(comments.map((c) => c.author).filter(Boolean))] as string[];
  const key = authors.join("|");
  useEffect(() => {
    let alive = true;
    for (const wid of authors) {
      getProfileInfo(wid).then((p) => {
        if (alive && p.name)
          setNames((prev) => (prev[wid] === p.name ? prev : { ...prev, [wid]: p.name! }));
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return names;
}

export function Comments({ screenId }: { screenId: string }) {
  const { isLoggedIn, webId, login, name: myName, isAdmin } = useSolid();
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
  const authorNames = useAuthorNames(comments);

  // Deep link to one comment (?c=<comment url>): scroll it into view and
  // highlight it briefly once the list has loaded.
  const [params] = useSearchParams();
  const target = params.get("c");
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => {
    if (!target || loading) return;
    const el = document.getElementById(`comment-${commentDomId(target)}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlight(target);
    const t = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(t);
  }, [target, loading, comments.length]);
  const labelFor = (c: Comment) => (c.author && authorNames[c.author]) || c.authorLabel;

  // Private notes live in the author's own pod (only they can delete them);
  // public comments live in the admin pod (only the admin can).
  const canDelete = (c: Comment) =>
    c.visibility === "private" ? !!webId && c.author === webId : isAdmin;

  async function remove(c: Comment) {
    if (!window.confirm("Delete this comment?")) return;
    setError("");
    try {
      await deleteComment(c.id);
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      setError((err as Error).message || "Could not delete comment.");
    }
  }

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
        myName || webIdLabel(wid),
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
            {visible.map((c) =>
              c.kind === "version" ? (
                <li
                  key={c.id}
                  id={`comment-${commentDomId(c.id)}`}
                  className="group flex items-center gap-3 text-xs text-muted-foreground"
                >
                  <span className="h-px flex-1 bg-border" />
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3" />
                    <span className="font-medium text-foreground/80">{labelFor(c)}</span> uploaded a
                    new version · {new Date(c.created).toLocaleDateString()}
                    {canDelete(c) && (
                      <button
                        type="button"
                        onClick={() => remove(c)}
                        title="Delete note"
                        aria-label="Delete note"
                        className="ml-1 rounded p-0.5 opacity-0 transition hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </li>
              ) : (
              <li
                key={c.id}
                id={`comment-${commentDomId(c.id)}`}
                className={cn(
                  "group flex gap-3 rounded-lg transition-colors",
                  highlight === c.id && "-mx-2 bg-secondary/70 px-2 py-1.5"
                )}
              >
                <AuthorAvatar
                  author={{ name: labelFor(c), webId: c.author }}
                  className="h-8 w-8 text-xs uppercase"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {c.author ? (
                      <Link
                        to={`/author/${encodeURIComponent(c.author)}`}
                        className="truncate text-sm font-semibold hover:underline"
                      >
                        {labelFor(c)}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-semibold">{labelFor(c)}</span>
                    )}
                    {c.visibility === "private" ? (
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Globe className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.created).toLocaleDateString()}
                    </span>
                    {canDelete(c) && (
                      <button
                        type="button"
                        onClick={() => remove(c)}
                        title="Delete comment"
                        aria-label="Delete comment"
                        className="ml-auto rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/90">
                    {c.text}
                  </p>
                </div>
              </li>
              )
            )}
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
