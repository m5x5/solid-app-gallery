import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Inbox, FilePlus, Flag, Trash2, ShieldCheck } from "lucide-react";
import { useSolid } from "@/lib/solid-context";
import { getApp, appBySource, reloadCatalog } from "@/lib/apps";
import {
  loadUploadInbox,
  loadUploadTags,
  publishScreenshotsToCatalog,
  dismissNotice,
  fetchImageObjectUrl,
  loadAdmins,
  addAdmin,
  removeAdmin,
  loadSubmissionInbox,
  publishSubmissionToCatalog,
  loadDeletionInbox,
  markAppDeleted,
  loadModeratorInbox,
  type ModeratorRequest,
  type UploadNotice,
  type SubmissionNotice,
  type DeletionNotice,
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
  const { webId, isAdmin: admin, isOwner } = useSolid();
  const [notices, setNotices] = useState<UploadNotice[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [patterns, setPatterns] = useState<Record<string, string[]>>({});
  const [submissions, setSubmissions] = useState<SubmissionNotice[]>([]);
  const [deletions, setDeletions] = useState<DeletionNotice[]>([]);
  const [modRequests, setModRequests] = useState<ModeratorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  // Outcome of the last publish/dismiss, so a row vanishing from the queue is
  // never the only signal of what happened.
  const [result, setResult] = useState<{ text: string; appId?: string } | null>(null);

  useEffect(() => {
    if (!admin) return;
    setLoading(true);
    Promise.all([
      loadUploadInbox().then(async (rawList) => {
        // The notification only captures tags as of upload time; the uploader
        // may have since edited them (setUploadTags), so pull the current
        // per-app tags.json and prefer it when present.
        const byApp = new Map<string, Promise<Record<string, string[]>>>();
        const list = await Promise.all(
          rawList.map(async (n) => {
            const key = `${n.actor}|${n.appId}`;
            if (!byApp.has(key)) byApp.set(key, loadUploadTags(n.actor, n.appId).catch(() => ({})));
            const current = (await byApp.get(key)!)[n.imageUrl];
            return current?.length ? { ...n, tags: current } : n;
          })
        );
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
      loadDeletionInbox().then(setDeletions),
      isOwner ? loadModeratorInbox().then(setModRequests) : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [admin, isOwner]);

  function toggleTag(noticeId: string, tag: string) {
    setPatterns((prev) => {
      const have = prev[noticeId] || [];
      const next = have.includes(tag)
        ? have.filter((t) => t !== tag)
        : [...have, tag];
      return { ...prev, [noticeId]: next };
    });
  }

  // The submission an upload belongs to, when the app isn't in the catalog yet
  // (screenshots uploaded from the "Edit your submission" page are keyed by
  // the submission's future catalog id).
  const submissionFor = (appId: string) =>
    submissions.find((s) => s.sub.id === appId);

  async function publish(n: UploadNotice) {
    setBusy(n.id);
    setResult(null);
    try {
      const tags = patterns[n.id]?.length ? patterns[n.id] : ["Dashboard"];
      await publishScreenshotsToCatalog(n.appId, [
        { url: n.imageUrl, tags, by: n.actor, at: n.published },
      ]);
      await dismissNotice(n.id).catch(() => {});
      setNotices((prev) => prev.filter((x) => x.id !== n.id));
      await reloadCatalog();
      const app = getApp(n.appId);
      setResult(
        app
          ? { text: `Screenshot published to ${app.name} ✓`, appId: n.appId }
          : {
              text: `Screenshot published ✓ — it appears once "${
                submissionFor(n.appId)?.sub.name || "its app submission"
              }" is published too.`,
            }
      );
    } catch (err) {
      setResult({ text: `Publish failed: ${(err as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function dismiss(n: UploadNotice) {
    setBusy(n.id);
    setResult(null);
    try {
      await dismissNotice(n.id);
      setNotices((prev) => prev.filter((x) => x.id !== n.id));
      setResult({ text: "Upload dismissed." });
    } catch (err) {
      setResult({ text: `Dismiss failed: ${(err as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function publishSubmission(n: SubmissionNotice) {
    setBusy(n.id);
    setResult(null);
    try {
      const id = await publishSubmissionToCatalog(n.sub, n.submissionUrl, {
        by: n.actor,
        at: n.published,
      });
      await dismissNotice(n.id).catch(() => {});
      setSubmissions((prev) => prev.filter((x) => x.id !== n.id));
      await reloadCatalog();
      const app = getApp(id);
      const hasScreens = notices.some((u) => u.appId === id);
      setResult({
        text: n.isUpdate
          ? `${n.sub.name} updated in the catalog ✓`
          : `${n.sub.name} published ✓${
              hasScreens ? " — its screenshots are waiting below." : ""
            }`,
        appId: app ? id : undefined,
      });
    } catch (err) {
      setResult({ text: `Publish failed: ${(err as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function deleteApp(n: DeletionNotice) {
    const app = getApp(n.appId);
    if (!window.confirm(`Mark "${app?.name || n.appId}" as deleted? It disappears from all listings (restorable from its page).`))
      return;
    setBusy(n.id);
    setResult(null);
    try {
      await markAppDeleted(n.appId, n.reason);
      await dismissNotice(n.id).catch(() => {});
      // Other requests for the same app are moot now — clear them too.
      const same = deletions.filter((d) => d.appId === n.appId && d.id !== n.id);
      await Promise.all(same.map((d) => dismissNotice(d.id).catch(() => {})));
      setDeletions((prev) => prev.filter((d) => d.appId !== n.appId));
      await reloadCatalog();
      setResult({ text: `${app?.name || "App"} marked as deleted ✓`, appId: n.appId });
    } catch (err) {
      setResult({ text: `Delete failed: ${(err as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function approveModerator(r: ModeratorRequest) {
    if (!window.confirm(`Add ${actorLabel(r.actor)} (${r.actor}) to the moderators group?`)) return;
    setBusy(r.id);
    setResult(null);
    try {
      await addAdmin(r.actor);
      await dismissNotice(r.id).catch(() => {});
      setModRequests((prev) => prev.filter((x) => x.id !== r.id));
      setResult({ text: `${actorLabel(r.actor)} is now a moderator ✓` });
    } catch (err) {
      setResult({ text: `Adding moderator failed: ${(err as Error).message}` });
    } finally {
      setBusy("");
    }
  }
  async function dismissModerator(r: ModeratorRequest) {
    setBusy(r.id);
    setResult(null);
    try {
      await dismissNotice(r.id);
      setModRequests((prev) => prev.filter((x) => x.id !== r.id));
      setResult({ text: "Moderator request dismissed." });
    } catch (err) {
      setResult({ text: `Dismiss failed: ${(err as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function dismissDeletion(n: DeletionNotice) {
    setBusy(n.id);
    setResult(null);
    try {
      await dismissNotice(n.id);
      setDeletions((prev) => prev.filter((x) => x.id !== n.id));
      setResult({ text: "Deletion request dismissed." });
    } catch (err) {
      setResult({ text: `Dismiss failed: ${(err as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function dismissSubmission(n: SubmissionNotice) {
    setBusy(n.id);
    setResult(null);
    try {
      await dismissNotice(n.id);
      setSubmissions((prev) => prev.filter((x) => x.id !== n.id));
      setResult({ text: "Submission dismissed." });
    } catch (err) {
      setResult({ text: `Dismiss failed: ${(err as Error).message}` });
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

      {isOwner && <AdminManager currentWebId={webId} />}

      {result && (
        <div
          role="status"
          className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
        >
          <span>{result.text}</span>
          {result.appId && (
            <Link
              to={`/app/${encodeURIComponent(result.appId)}`}
              className="font-medium underline"
            >
              View in gallery
            </Link>
          )}
        </div>
      )}

      {isOwner && (
        <>
      <div className="mt-10 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5" />
        <h2 className="text-xl font-bold">Moderator requests</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        People asking for moderator access (from the Participation page). Approving adds their
        WebID to the moderators group — only you, as the catalog owner, can do this.
      </p>
      {!loading && modRequests.length === 0 && (
        <p className="py-6 text-center text-muted-foreground">No pending requests.</p>
      )}
      {modRequests.length > 0 && (
        <ul className="mt-4 space-y-4">
          {modRequests.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  <Link to={`/author/${encodeURIComponent(r.actor)}`} className="hover:underline">
                    {actorLabel(r.actor)}
                  </Link>
                </div>
                <div className="truncate text-xs text-muted-foreground">{r.actor}</div>
                {r.message && <p className="mt-1 whitespace-pre-wrap text-sm">{r.message}</p>}
                <div className="mt-1 text-sm text-muted-foreground">
                  {r.published ? new Date(r.published).toLocaleString() : ""}
                </div>
              </div>
              <Button onClick={() => approveModerator(r)} disabled={busy === r.id} className="gap-1.5">
                <Check className="h-4 w-4" /> Make moderator
              </Button>
              <Button
                onClick={() => dismissModerator(r)}
                disabled={busy === r.id}
                variant="outline"
                className="gap-1.5"
              >
                <X className="h-4 w-4" /> Dismiss
              </Button>
            </li>
          ))}
        </ul>
      )}
        </>
      )}

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
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{n.sub.name}</span>
                  {n.isUpdate && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      Update
                    </span>
                  )}
                  {!n.isUpdate &&
                    ((n.sub.id && getApp(n.sub.id)) ||
                      (n.submissionUrl && appBySource(n.submissionUrl))) && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      Already published
                    </span>
                  )}
                </div>
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
        <Flag className="h-5 w-5" />
        <h2 className="text-xl font-bold">Deletion requests</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Apps users flagged for removal, with their reason. Marking one as deleted
        hides it from every listing (its page stays reachable and can be restored).
      </p>
      {!loading && deletions.length === 0 && (
        <p className="py-10 text-center text-muted-foreground">No deletion requests.</p>
      )}
      {deletions.length > 0 && (
        <ul className="mt-4 space-y-4">
          {deletions.map((n) => {
            const app = getApp(n.appId);
            return (
              <li
                key={n.id}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">
                      {app ? (
                        <Link
                          to={`/app/${encodeURIComponent(n.appId)}`}
                          className="hover:underline"
                        >
                          {app.name}
                        </Link>
                      ) : (
                        <span title={n.appId}>Unknown app</span>
                      )}
                    </span>
                    {app?.deleted && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                        Already deleted
                      </span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{n.reason || "(no reason given)"}</p>
                  <div className="mt-1 text-sm text-muted-foreground">
                    from {actorLabel(n.actor)}
                    {n.published ? ` · ${new Date(n.published).toLocaleDateString()}` : ""}
                  </div>
                </div>
                {app && !app.deleted && (
                  <Button
                    onClick={() => deleteApp(n)}
                    disabled={busy === n.id}
                    variant="destructive"
                    className="gap-1.5"
                  >
                    <Trash2 className="h-4 w-4" /> Mark as deleted
                  </Button>
                )}
                <Button
                  onClick={() => dismissDeletion(n)}
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
                    ) : submissionFor(n.appId) ? (
                      <>
                        {submissionFor(n.appId)!.sub.name}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          — pending submission (publish it above)
                        </span>
                      </>
                    ) : (
                      <span title={n.appId}>Unknown app</span>
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
