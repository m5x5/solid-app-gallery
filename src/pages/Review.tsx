import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  X,
  Inbox,
  FilePlus,
  Flag,
  Trash2,
  ShieldCheck,
  Archive,
  ChevronDown,
  Undo2,
} from "lucide-react";
import { useSolid } from "@/lib/solid-context";
import { getApp, appBySource, reloadCatalog } from "@/lib/apps";
import {
  loadUploadInbox,
  loadUploadTags,
  publishScreenshotsToCatalog,
  dismissNotice,
  archiveNotice,
  loadDismissedNotices,
  restoreNotice,
  type DismissedNotice,
  fetchImageObjectUrl,
  loadAdmins,
  addAdmin,
  removeAdmin,
  loadSubmissionInbox,
  publishSubmissionToCatalog,
  loadDeletionInbox,
  markAppDeleted,
  loadModeratorInbox,
  ensureInboxAdminAccess,
  InboxAccessError,
  type ModeratorRequest,
  type UploadNotice,
  type SubmissionNotice,
  type DeletionNotice,
} from "@/lib/solid-data";
import { AdminManager } from "@/components/AdminManager";
import { notifyPeople, type ActivityKind } from "@/lib/activity";
import { Button } from "@/components/ui/button";

const SCREEN_PATTERNS = ["Login", "Onboarding", "Dashboard", "Profile", "Signup"];

// Every field of a submission as the notification carried it, so a reviewer
// sees exactly what would be published.
function SubmissionDetails({ notice: n }: { notice: SubmissionNotice }) {
  const link = (href?: string) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer" className="break-all underline">
        {href}
      </a>
    ) : undefined;
  const rows: [string, React.ReactNode][] = [
    ["Description", n.sub.description && <span className="whitespace-pre-wrap">{n.sub.description}</span>],
    ["Category", n.sub.subType],
    ["Status", n.sub.status],
    ["Technical keywords", n.sub.technicalKeyword],
    ["Website", link(n.sub.landingPage)],
    ["Repository", link(n.sub.repository)],
    [
      "Author",
      n.sub.authorWebId && (
        <Link to={`/author/${encodeURIComponent(n.sub.authorWebId)}`} className="break-all underline">
          {n.sub.authorWebId}
        </Link>
      ),
    ],
    [
      "Submitted by",
      n.actor && (
        <Link to={`/author/${encodeURIComponent(n.actor)}`} className="break-all underline">
          {n.actor}
        </Link>
      ),
    ],
    ["Submitted", n.published && new Date(n.published).toLocaleString()],
    ["Record", link(n.submissionUrl)],
    ["ID", n.sub.id && <span className="break-all">{n.sub.id}</span>],
  ];
  return (
    <dl className="grid basis-full grid-cols-1 gap-x-4 gap-y-2 border-t border-border pt-4 text-sm sm:grid-cols-[10rem_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0">{value || <span className="text-muted-foreground">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function actorLabel(webId: string): string {
  try {
    const u = new URL(webId);
    return u.pathname.split("/").filter(Boolean)[0] || u.host;
  } catch {
    return webId || "someone";
  }
}

// One person dropping a batch of screenshots on the same app is one piece of
// work for the reviewer, not N — group uploads by uploader + app when they
// arrived within half a day of each other.
const UPLOAD_GROUP_WINDOW_MS = 12 * 60 * 60 * 1000;

type UploadGroup = {
  key: string;
  actor: string;
  appId: string;
  items: UploadNotice[];
};

function groupUploads(list: UploadNotice[]): UploadGroup[] {
  const time = (n: UploadNotice) => Date.parse(n.published || "") || 0;
  const groups: UploadGroup[] = [];
  for (const n of [...list].sort((a, b) => (b.published || "").localeCompare(a.published || ""))) {
    // Within 12h of the group's newest upload — not a chain of 12h hops, which
    // could stretch a "group" across days.
    const near = groups.find(
      (g) =>
        g.actor === n.actor &&
        g.appId === n.appId &&
        Math.abs(time(g.items[0]) - time(n)) <= UPLOAD_GROUP_WINDOW_MS
    );
    if (near) near.items.push(n);
    else groups.push({ key: n.id, actor: n.actor, appId: n.appId, items: [n] });
  }
  return groups;
}

// "12 Aug, 14:03" / "12 Aug, 14:03 – 19:41" for a batch.
function groupWhen(items: UploadNotice[]): string {
  const stamps = items.map((i) => i.published).filter(Boolean).sort() as string[];
  if (!stamps.length) return "";
  const first = new Date(stamps[0]);
  const last = new Date(stamps[stamps.length - 1]);
  const date = first.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return stamps.length > 1 && t(first) !== t(last)
    ? `${date}, ${t(first)} – ${t(last)}`
    : `${date}, ${t(first)}`;
}

export function Review() {
  const { webId, name: myName, isAdmin: admin, isOwner } = useSolid();
  // Let the person behind a notice know what a moderator did with it. Fired
  // after the action succeeded, never awaited: the inbox is best-effort.
  function tell(
    to: string[],
    kind: ActivityKind,
    fields: { summary: string; content?: string; path?: string }
  ) {
    if (!webId) return;
    notifyPeople(to, { webId, name: myName || actorLabel(webId) }, kind, fields).catch(() => {});
  }
  const [notices, setNotices] = useState<UploadNotice[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [patterns, setPatterns] = useState<Record<string, string[]>>({});
  const [submissions, setSubmissions] = useState<SubmissionNotice[]>([]);
  const [deletions, setDeletions] = useState<DeletionNotice[]>([]);
  const [modRequests, setModRequests] = useState<ModeratorRequest[]>([]);
  // Everything an admin waved away, so a dismissal is reviewable and reversible.
  const [dismissed, setDismissed] = useState<DismissedNotice[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  // Submissions whose full details are unfolded, so a reviewer can read the
  // whole thing before publishing.
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // Why the inbox couldn't be read, if it couldn't — shown instead of the
  // "nothing pending" states, which would otherwise hide a missing permission.
  const [inboxError, setInboxError] = useState("");
  const [busy, setBusy] = useState<string>("");
  // Outcome of the last publish/dismiss, so a row vanishing from the queue is
  // never the only signal of what happened.
  const [result, setResult] = useState<{ text: string; appId?: string } | null>(null);

  useEffect(() => {
    if (!admin) return;
    setLoading(true);
    setInboxError("");
    const inboxFailed = (err: unknown) =>
      setInboxError(
        err instanceof InboxAccessError
          ? "You're not allowed to read the admin inbox, so submissions, uploads and deletion requests can't be shown. Ask the catalog owner to open this page once — that grants moderators access."
          : `Couldn't load the admin inbox: ${(err as Error).message}`
      );
    // The owner grants the moderators group inbox access before reading it.
    (isOwner ? ensureInboxAdminAccess() : Promise.resolve()).then(() => Promise.all([
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
    ]).catch(inboxFailed))
      .finally(() => setLoading(false));
    loadDismissedNotices().then(setDismissed);
  }, [admin, isOwner]);

  // Put a dismissed notice back in the queue and refresh the lists it belongs
  // to, so it reappears above without a page reload.
  async function restore(d: DismissedNotice) {
    setBusy(d.id);
    setResult(null);
    try {
      await restoreNotice(d.id);
      setDismissed((prev) => prev.filter((x) => x.id !== d.id));
      const [uploads, subs, dels] = await Promise.all([
        loadUploadInbox(),
        loadSubmissionInbox(),
        loadDeletionInbox(),
      ]);
      setNotices(uploads);
      setSubmissions(subs);
      setDeletions(dels);
      setResult({ text: "Restored to the review queue ✓" });
    } catch (err) {
      setResult({ text: `Restore failed: ${(err as Error).message}` });
    } finally {
      setBusy("");
    }
  }

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
  const uploadGroups = useMemo(() => groupUploads(notices), [notices]);

  const submissionFor = (appId: string) =>
    submissions.find((s) => s.sub.id === appId);

  // Publishes a whole batch in one catalog write (publishScreenshotsToCatalog
  // takes the list), instead of one read-modify-write cycle per screenshot.
  async function publishGroup(g: UploadGroup) {
    setBusy(g.key);
    setResult(null);
    const n = g.items.length;
    try {
      await publishScreenshotsToCatalog(
        g.appId,
        g.items.map((it) => ({
          url: it.imageUrl,
          tags: patterns[it.id]?.length ? patterns[it.id] : ["Dashboard"],
          by: it.actor,
          at: it.published,
        }))
      );
      await Promise.all(g.items.map((it) => dismissNotice(it.id).catch(() => {})));
      const done = new Set(g.items.map((it) => it.id));
      setNotices((prev) => prev.filter((x) => !done.has(x.id)));
      await reloadCatalog();
      const app = getApp(g.appId);
      const what = `${n} screenshot${n === 1 ? "" : "s"}`;
      tell(g.items.map((it) => it.actor), "published", {
        summary: `published your screenshots of ${app?.name || submissionFor(g.appId)?.sub.name || "an app"}`,
        path: app ? `/app/${encodeURIComponent(g.appId)}` : undefined,
      });
      setResult(
        app
          ? { text: `Published ${what} to ${app.name} ✓`, appId: g.appId }
          : {
              text: `Published ${what} ✓ — they appear once "${
                submissionFor(g.appId)?.sub.name || "the app submission"
              }" is published too.`,
            }
      );
    } catch (err) {
      setResult({ text: `Publish failed: ${(err as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function dismissGroup(g: UploadGroup) {
    setBusy(g.key);
    setResult(null);
    const n = g.items.length;
    try {
      await Promise.all(g.items.map((it) => archiveNotice(it.id, webId || undefined)));
      const done = new Set(g.items.map((it) => it.id));
      setNotices((prev) => prev.filter((x) => !done.has(x.id)));
      tell(g.items.map((it) => it.actor), "dismissed", {
        summary: `dismissed your screenshot upload for ${getApp(g.appId)?.name || submissionFor(g.appId)?.sub.name || "an app"}`,
      });
      setResult({ text: `Dismissed ${n} upload${n === 1 ? "" : "s"}.` });
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
      tell([n.actor], "published", {
        summary: n.isUpdate
          ? `published your update to ${n.sub.name}`
          : `published your app submission ${n.sub.name}`,
        path: app ? `/app/${encodeURIComponent(id)}` : undefined,
      });
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
      tell([n, ...same].map((d) => d.actor), "deleted", {
        summary: `removed ${app?.name || "an app"} from the gallery, as you requested`,
        content: n.reason,
      });
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
      tell([r.actor], "moderator", { summary: "made you a moderator", path: "/review" });
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
      await archiveNotice(r.id, webId || undefined);
      setModRequests((prev) => prev.filter((x) => x.id !== r.id));
      tell([r.actor], "dismissed", { summary: "declined your moderator request" });
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
      await archiveNotice(n.id, webId || undefined);
      setDeletions((prev) => prev.filter((x) => x.id !== n.id));
      tell([n.actor], "dismissed", {
        summary: `kept ${getApp(n.appId)?.name || "an app"} after your removal request`,
      });
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
      await archiveNotice(n.id, webId || undefined);
      setSubmissions((prev) => prev.filter((x) => x.id !== n.id));
      tell([n.actor], "dismissed", { summary: `dismissed your app submission ${n.sub.name}` });
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

      {inboxError && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {inboxError}
        </div>
      )}

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
      {!loading && !inboxError && modRequests.length === 0 && (
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
      {!loading && !inboxError && submissions.length === 0 && (
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
                  {n.published && (
                    <>
                      {" · "}
                      <time dateTime={n.published}>
                        {new Date(n.published).toLocaleString()}
                      </time>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setOpenSubs((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(n.id)) next.add(n.id);
                      return next;
                    })
                  }
                  className="mt-1 flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
                  aria-expanded={openSubs.has(n.id)}
                >
                  {openSubs.has(n.id) ? "Hide details" : "Show details"}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${openSubs.has(n.id) ? "rotate-180" : ""}`}
                  />
                </button>
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
              {openSubs.has(n.id) && <SubmissionDetails notice={n} />}
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
      {!loading && !inboxError && deletions.length === 0 && (
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
      ) : inboxError ? null : notices.length === 0 ? (
        <p className="py-20 text-center text-muted-foreground">
          No pending uploads. New screenshot uploads will appear here.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {uploadGroups.map((g) => {
            const app = getApp(g.appId);
            const multi = g.items.length > 1;
            return (
              <li
                key={g.key}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">
                    {app ? (
                      <Link
                        to={`/app/${encodeURIComponent(g.appId)}`}
                        className="hover:underline"
                      >
                        {app.name}
                      </Link>
                    ) : submissionFor(g.appId) ? (
                      <>
                        {submissionFor(g.appId)!.sub.name}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          — pending submission (publish it above)
                        </span>
                      </>
                    ) : (
                      <span title={g.appId}>Unknown app</span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {multi && `${g.items.length} screenshots · `}
                    from {actorLabel(g.actor)}
                    {groupWhen(g.items) && ` · ${groupWhen(g.items)}`}
                  </span>
                </div>

                {/* One row per screenshot: flows stay per-image, the batch is
                    published or dismissed as a whole. */}
                <ul className="mt-3 space-y-3">
                  {g.items.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center gap-4">
                      <div className="h-24 w-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
                        {thumbs[n.id] && (
                          <img src={thumbs[n.id]} alt="" className="h-full w-full object-cover" />
                        )}
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
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => publishGroup(g)}
                    disabled={busy === g.key}
                    className="gap-1.5"
                  >
                    <Check className="h-4 w-4" />
                    {multi ? `Publish all ${g.items.length}` : "Publish"}
                  </Button>
                  <Button
                    onClick={() => dismissGroup(g)}
                    disabled={busy === g.key}
                    variant="outline"
                    className="gap-1.5"
                  >
                    <X className="h-4 w-4" /> {multi ? "Dismiss all" : "Dismiss"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Dismissed — nothing is deleted outright, so a mis-click or a change of
          mind is recoverable, and the record of a contribution survives. */}
      <div className="mt-12">
        <button
          type="button"
          onClick={() => setShowDismissed((v) => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
          aria-expanded={showDismissed}
        >
          <Archive className="h-4 w-4" />
          Dismissed ({dismissed.length})
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showDismissed ? "rotate-180" : ""}`}
          />
        </button>

        {showDismissed &&
          (dismissed.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nothing dismissed yet. Dismissed uploads, submissions, removal and
              moderator requests are kept here and can be put back.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {dismissed.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {d.summary || d.type || "Notification"}
                      {d.appName && ` — ${d.appName}`}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      from {actorLabel(d.actor)}
                      {d.dismissedAt &&
                        ` · dismissed ${new Date(d.dismissedAt).toLocaleDateString()}`}
                      {d.dismissedBy && ` by ${actorLabel(d.dismissedBy)}`}
                    </div>
                    {d.content && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {d.content}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => restore(d)}
                    disabled={busy === d.id}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                  >
                    <Undo2 className="h-4 w-4" /> Restore
                  </Button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
