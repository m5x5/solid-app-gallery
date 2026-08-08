import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Inbox, FilePlus } from "lucide-react";
import { useSolid } from "@/lib/solid-context";
import { getApp } from "@/lib/apps";
import {
  loadUploadInbox,
  publishScreenshotsToCatalog,
  dismissNotice,
  fetchImageObjectUrl,
  loadAdmins,
  addAdmin,
  removeAdmin,
  loadSubmissionInbox,
  publishSubmissionToCatalog,
  type UploadNotice,
  type SubmissionNotice,
} from "@/lib/solid-data";
import { AdminManager } from "@/components/AdminManager";
import { Button } from "@/components/ui/button";

const SCREEN_PATTERNS = ["Login", "Onboarding", "Dashboard", "Profile", "Signup"];

function actorLabel(webId: string): string {
  try {
    const u = new URL(webId);
    return u.pathname.split("/").filter(Boolean)[0] || u.host;
  } catch {
    return webId || "someone";
  }
}

export function Review() {
  const { webId, isAdmin: admin } = useSolid();
  const [notices, setNotices] = useState<UploadNotice[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [patterns, setPatterns] = useState<Record<string, string[]>>({});
  const [submissions, setSubmissions] = useState<SubmissionNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");

  useEffect(() => {
    if (!admin) return;
    setLoading(true);
    Promise.all([
      loadUploadInbox().then(async (list) => {
        setNotices(list);
        // Seed each notice's tag selection with what the uploader proposed
        // (falling back to Dashboard) so the reviewer starts from their intent.
        setPatterns(
          Object.fromEntries(
            list.map((n) => [n.id, n.tags.length ? n.tags : ["Dashboard"]])
          )
        );
        const entries = await Promise.all(
          list.map((n) =>
            fetchImageObjectUrl(n.imageUrl)
              .then((src) => [n.id, src] as const)
              .catch(() => [n.id, ""] as const)
          )
        );
        setThumbs(Object.fromEntries(entries.filter(([, s]) => s)));
      }),
      loadSubmissionInbox().then(setSubmissions),
    ]).finally(() => setLoading(false));
  }, [admin]);

  function toggleTag(noticeId: string, tag: string) {
    setPatterns((prev) => {
      const have = prev[noticeId] || [];
      const next = have.includes(tag)
        ? have.filter((t) => t !== tag)
        : [...have, tag];
      return { ...prev, [noticeId]: next };
    });
  }

  async function publish(n: UploadNotice) {
    setBusy(n.id);
    try {
      const tags = patterns[n.id]?.length ? patterns[n.id] : ["Dashboard"];
      await publishScreenshotsToCatalog(n.appId, [{ url: n.imageUrl, tags }]);
      await dismissNotice(n.id).catch(() => {});
      setNotices((prev) => prev.filter((x) => x.id !== n.id));
    } catch (err) {
      alert(`Publish failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function dismiss(n: UploadNotice) {
    setBusy(n.id);
    try {
      await dismissNotice(n.id);
      setNotices((prev) => prev.filter((x) => x.id !== n.id));
    } finally {
      setBusy("");
    }
  }

  async function publishSubmission(n: SubmissionNotice) {
    setBusy(n.id);
    try {
      await publishSubmissionToCatalog(n.sub);
      await dismissNotice(n.id).catch(() => {});
      setSubmissions((prev) => prev.filter((x) => x.id !== n.id));
    } catch (err) {
      alert(`Publish failed: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  async function dismissSubmission(n: SubmissionNotice) {
    setBusy(n.id);
    try {
      await dismissNotice(n.id);
      setSubmissions((prev) => prev.filter((x) => x.id !== n.id));
    } finally {
      setBusy("");
    }
  }

  if (!admin) {
    return (
      <div className="mx-auto max-w-[800px] px-4 py-16 text-center text-muted-foreground">
        This review queue is only available to the catalog admin.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 md:px-8">
      <h1 className="text-2xl font-bold">Review queue</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Screenshot uploads and app submissions from users (via Linked Data
        Notifications). Publish to add them to the catalog, or dismiss.
      </p>

      <AdminManager currentWebId={webId} />

      <div className="mt-10 flex items-center gap-2">
        <FilePlus className="h-5 w-5" />
        <h2 className="text-xl font-bold">New app submissions</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Apps submitted via the "Submit an app" form. Publish to add them to the
        catalog, or dismiss.
      </p>
      {!loading && submissions.length === 0 && (
        <p className="py-10 text-center text-muted-foreground">
          No pending submissions.
        </p>
      )}
      {submissions.length > 0 && (
        <ul className="mt-4 space-y-4">
          {submissions.map((n) => (
            <li
              key={n.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{n.sub.name}</div>
                {n.sub.description && (
                  <div className="truncate text-sm text-muted-foreground">
                    {n.sub.description}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  from {actorLabel(n.actor)}
                  {n.published
                    ? ` · ${new Date(n.published).toLocaleDateString()}`
                    : ""}
                </div>
              </div>
              <Button
                onClick={() => publishSubmission(n)}
                disabled={busy === n.id}
                className="gap-1.5"
              >
                <Check className="h-4 w-4" /> Publish
              </Button>
              <Button
                onClick={() => dismissSubmission(n)}
                disabled={busy === n.id}
                variant="outline"
                className="gap-1.5"
              >
                <X className="h-4 w-4" /> Dismiss
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 flex items-center gap-2">
        <Inbox className="h-5 w-5" />
        <h2 className="text-xl font-bold">Upload review queue</h2>
      </div>

      {loading ? (
        <p className="py-20 text-center text-muted-foreground">Loading inbox…</p>
      ) : notices.length === 0 ? (
        <p className="py-20 text-center text-muted-foreground">
          No pending uploads. New screenshot uploads will appear here.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {notices.map((n) => {
            const app = getApp(n.appId);
            return (
              <li
                key={n.id}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4"
              >
                <div className="h-24 w-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
                  {thumbs[n.id] && (
                    <img
                      src={thumbs[n.id]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {app ? (
                      <Link
                        to={`/app/${encodeURIComponent(n.appId)}`}
                        className="hover:underline"
                      >
                        {app.name}
                      </Link>
                    ) : (
                      n.appId
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    from {actorLabel(n.actor)}
                    {n.published
                      ? ` · ${new Date(n.published).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Screen pattern tags"
                >
                  {SCREEN_PATTERNS.map((p) => {
                    const active = (patterns[n.id] || []).includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleTag(n.id, p)}
                        disabled={!!busy}
                        aria-pressed={active}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                <Button
                  onClick={() => publish(n)}
                  disabled={busy === n.id}
                  className="gap-1.5"
                >
                  <Check className="h-4 w-4" /> Publish
                </Button>
                <Button
                  onClick={() => dismiss(n)}
                  disabled={busy === n.id}
                  variant="outline"
                  className="gap-1.5"
                >
                  <X className="h-4 w-4" /> Dismiss
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
