import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Send, Lock, Globe, Trash2, RefreshCw, Loader2, Github } from "lucide-react";
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
import type { App } from "@/lib/apps";
import { notifyPeople, threadAudience } from "@/lib/activity";

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

const GITHUB_ISSUE_RE = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/(issues|pull)\/(\d+)\/?$/i;

// "owner/repo#12" label for a GitHub issue URL (falls back to the raw URL).
function issueLabel(url: string): string {
  const m = url.match(GITHUB_ISSUE_RE);
  return m ? `${m[1]}/${m[2]}#${m[4]}` : url;
}

// Prefilled "new issue" link for the app's GitHub repo: the screenshot, the
// public conversation as a quote, and a link back to this exact thread. Private
// notes are never included. Null when the app has no GitHub repository.
function githubIssueUrl(app: App, image: string | undefined, screenId: string, comments: Comment[]): string | null {
  const m = app.repository?.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return null;
  const thread = comments.filter((c) => c.visibility === "public" && (c.kind ?? "comment") === "comment");
  if (!thread.length) return null;
  const idx = screenId.slice(screenId.lastIndexOf("::") + 2);
  const link = new URL(`/screen/${encodeURIComponent(app.id)}`, window.location.origin);
  link.searchParams.set("i", idx);
  link.searchParams.set("c", thread[0].id);
  const quote = (c: Comment) =>
    `> **${c.authorLabel}** · ${new Date(c.created).toLocaleDateString()}\n` +
    c.text.trim().split("\n").map((l) => `> ${l}`).join("\n");
  const shot = image && !image.startsWith("blob:") && !image.startsWith("data:")
    ? `<img src="${new URL(image, window.location.origin).href}" alt="Screenshot of ${app.name}" width="320" />\n\n`
    : "";
  const body =
    `${shot}${thread.map(quote).join("\n>\n")}\n\n` +
    `[View this conversation on Solid App Gallery](${link.href})`;
  const title = thread[0].text.trim().split("\n")[0].slice(0, 80);
  const u = new URL(`https://github.com/${m[1]}/${m[2].replace(/\.git$/, "")}/issues/new`);
  u.searchParams.set("title", title);
  // Stay under GitHub's URL length limit; the link back carries the full thread.
  u.searchParams.set("body", body.length > 5000 ? `${body.slice(0, 5000)}…\n\n[Full conversation](${link.href})` : body);
  return u.href;
}

export function Comments({ screenId, app, image }: { screenId: string; app?: App; image?: string }) {
  const { isLoggedIn, webId, login, name: myName, isAdmin } = useSolid();
  const [tab, setTab] = useState<Tab>("all");
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the composer as the user types, up to a max height, then scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const refresh = useCallback(() => {
    setLoading(true);
    loadComments(screenId, webId)
      .then(setComments)
      .finally(() => setLoading(false));
  }, [screenId, webId]);

  useEffect(refresh, [refresh]);

  // A fast load would flash the spinner, so only show it once the fetch has
  // been running for half a second.
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    if (!loading) {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), 500);
    return () => clearTimeout(t);
  }, [loading]);
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
        tab === "private" ? "private" : "public",
        // A pasted GitHub issue link becomes a special "issue opened" note.
        tab !== "private" && GITHUB_ISSUE_RE.test(value) ? "issue" : "comment"
      );
      setComments((prev) => [...prev, c]);
      // Tell everyone with a stake in this thread (never for private notes,
      // which only the author and the admin may see).
      if (app && c.visibility === "public") {
        const idx = Number(screenId.slice(screenId.lastIndexOf("::") + 2)) || 0;
        notifyPeople(
          threadAudience(app, idx, comments),
          { webId: wid, name: c.authorLabel },
          "comment",
          {
            summary:
              c.kind === "issue"
                ? `linked a GitHub issue on ${app.name}`
                : `commented on ${app.name}`,
            content: c.text,
            object: c.id,
            path: `/screen/${encodeURIComponent(app.id)}?i=${idx}&c=${encodeURIComponent(c.id)}`,
          }
        ).catch(() => {});
      }
    } catch (err) {
      setError((err as Error).message || "Could not post comment.");
      setText(value); // restore so the user can retry
    } finally {
      setBusy(false);
    }
  }

  const linkedIssue = comments.find((c) => c.kind === "issue" && c.visibility === "public");
  const issueUrl = app && !linkedIssue ? githubIssueUrl(app, image, screenId, comments) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5">
        {/* Loading shows as a spinner beside the title (after a short delay),
            so switching screens keeps the comments that are already on screen
            instead of blanking the panel out to a "Loading…" line. */}
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Comments</h2>
          {showSpinner && (
            <Loader2
              role="status"
              aria-label="Loading comments"
              className="h-4 w-4 animate-spin text-muted-foreground"
            />
          )}
          {linkedIssue && GITHUB_ISSUE_RE.test(linkedIssue.text) && (
            <a
              href={linkedIssue.text}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-semibold hover:bg-secondary/70"
            >
              <Github className="h-3.5 w-3.5" /> View issue
            </a>
          )}
          {issueUrl && (
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener"
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-semibold hover:bg-secondary/70"
            >
              <Github className="h-3.5 w-3.5" /> Create issue
            </a>
          )}
        </div>
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
        {visible.length === 0 ? (
          // Nothing to show yet: stay blank while loading rather than flashing
          // the empty state before the first comments arrive.
          loading ? null : (
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
          )
        ) : (
          <ul className="space-y-4">
            {visible.map((c) =>
              c.kind === "issue" && GITHUB_ISSUE_RE.test(c.text) ? (
                <li
                  key={c.id}
                  id={`comment-${commentDomId(c.id)}`}
                  className="group flex items-center gap-3 text-xs text-muted-foreground"
                >
                  <span className="h-px flex-1 bg-border" />
                  <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
                    <Github className="h-3 w-3" />
                    <span className="font-medium text-foreground/80">{labelFor(c)}</span> opened
                    <a
                      href={c.text}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground underline underline-offset-2"
                    >
                      {issueLabel(c.text)}
                    </a>
                    · {new Date(c.created).toLocaleDateString()}
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
              ) : c.kind === "version" ? (
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
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              tab === "private" ? "Add a private note…" : "Start a discussion, or paste a GitHub issue link…"
            }
            rows={2}
            data-testid="comment-input"
            className="w-full resize-none overflow-y-auto bg-transparent px-2 py-1 text-sm placeholder:text-muted-foreground focus:outline-none"
            style={{ maxHeight: 240 }}
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
